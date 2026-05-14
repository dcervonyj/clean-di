import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";

import { collectContexts } from "../../src/analyzer/collectContexts";
import { parseDiFile } from "../../src/analyzer/parseDiFile";

async function buildFixture(diSource: string): Promise<{ program: ts.Program; filePath: string; cleanup: () => Promise<void> }> {
  const root = join(tmpdir(), `clean-di-collect-test-${Date.now()}-${Math.random()}`);
  const cleanDiDir = join(root, "node_modules", "clean-di", "src", "public");
  await mkdir(cleanDiDir, { recursive: true });

  // Stub each public DSL entry the parser/collector cares about.
  for (const fn of ["defineContext", "defineConfig", "bean", "provide"]) {
    await writeFile(
      join(cleanDiDir, `${fn}.ts`),
      `export function ${fn}(...args: any[]): any { return args; }`,
    );
  }
  await writeFile(
    join(cleanDiDir, "index.ts"),
    [
      `export { defineContext } from "./defineContext";`,
      `export { defineConfig } from "./defineConfig";`,
      `export { bean } from "./bean";`,
      `export { provide } from "./provide";`,
    ].join("\n"),
  );
  await writeFile(
    join(root, "node_modules", "clean-di", "package.json"),
    JSON.stringify({
      name: "clean-di",
      main: "./src/public/index.ts",
      types: "./src/public/index.ts",
      exports: { ".": "./src/public/index.ts" },
    }),
  );

  const filePath = join(root, "input.di.ts");
  await writeFile(filePath, diSource);

  const program = ts.createProgram({
    rootNames: [filePath],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: false,
      noEmit: true,
      allowJs: false,
      skipLibCheck: true,
      esModuleInterop: true,
      baseUrl: root,
    },
  });

  return { program, filePath, cleanup: () => rm(root, { recursive: true, force: true }) };
}

describe("collectContexts()", () => {
  let cleanupFn: (() => Promise<void>) | null = null;
  afterEach(async () => {
    if (cleanupFn !== null) await cleanupFn();
    cleanupFn = null;
  });

  it("extracts a single context with its export name, config type, beans, and expose list", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean, provide } from "clean-di";
       interface MyConfig { readonly id: string }
       class Foo {}
       class Bar { constructor(public foo: Foo) {} }
       export const myContext = defineContext<MyConfig>()({
         beans: {
           id: provide((cfg) => cfg.id),
           foo: bean(Foo),
           bar: bean(Bar),
         },
         expose: ["foo", "bar"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const contexts = collectContexts(parsed);

    expect(contexts).toHaveLength(1);
    const ctx = contexts[0]!;
    expect(ctx.exportName).toBe("myContext");
    expect(ctx.configTypeName).toBe("MyConfig");
    expect(ctx.beans.map((b) => b.name)).toEqual(["id", "foo", "bar"]);
    expect(ctx.beans.map((b) => b.kind)).toEqual(["provide", "bean", "bean"]);
    expect(ctx.expose).toEqual(["foo", "bar"]);
  });

  it("returns configTypeName 'void' when omitted", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Foo {}
       export const ctx = defineContext()({ beans: { foo: bean(Foo) }, expose: ["foo"] as const });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const contexts = collectContexts(parsed);
    expect(contexts[0]!.configTypeName).toBe("void");
  });

  it("captures postConstruct and preDestroy expressions when present", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Foo {}
       export const ctx = defineContext()({
         beans: { foo: bean(Foo) },
         postConstruct: () => {},
         preDestroy: () => {},
         expose: ["foo"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const contexts = collectContexts(parsed);
    expect(contexts[0]!.postConstruct).toBeDefined();
    expect(contexts[0]!.preDestroy).toBeDefined();
  });

  it("captures imports as raw expressions (no resolution in W3)", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, defineConfig, bean } from "clean-di";
       class Foo {}
       const sub = defineConfig({ beans: { foo: bean(Foo) } });
       export const ctx = defineContext()({
         imports: [sub],
         beans: { foo: bean(Foo) },
         expose: ["foo"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const contexts = collectContexts(parsed);
    expect(contexts[0]!.imports).toHaveLength(1);
  });

  it("warns on multiple contexts in one file (but still returns them)", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class A {}
       class B {}
       export const ctxA = defineContext()({ beans: { a: bean(A) }, expose: ["a"] as const });
       export const ctxB = defineContext()({ beans: { b: bean(B) }, expose: ["b"] as const });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const contexts = collectContexts(parsed);

    expect(contexts).toHaveLength(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/2 contexts/));

    warnSpy.mockRestore();
  });
});
