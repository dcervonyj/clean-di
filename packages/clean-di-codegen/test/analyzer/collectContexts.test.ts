import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";

import { collectContexts } from "../../src/analyzer/collectContexts";
import { parseDiFile } from "../../src/analyzer/parseDiFile";

async function buildFixture(
  diSource: string,
): Promise<{ program: ts.Program; filePath: string; cleanup: () => Promise<void> }> {
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
    const result = collectContexts(parsed);

    expect(result.diagnostics).toEqual([]);
    expect(result.contexts).toHaveLength(1);
    const ctx = result.contexts[0]!;
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
    const result = collectContexts(parsed);
    expect(result.contexts[0]!.configTypeName).toBe("void");
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
    const result = collectContexts(parsed);
    expect(result.contexts[0]!.postConstruct).toBeDefined();
    expect(result.contexts[0]!.preDestroy).toBeDefined();
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
    const result = collectContexts(parsed);
    expect(result.contexts[0]!.imports).toHaveLength(1);
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
    const result = collectContexts(parsed);

    expect(result.contexts).toHaveLength(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/2 contexts/));

    warnSpy.mockRestore();
  });

  it("CDI-005 fires when defineContext is called without the curry", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Foo {}
       export const ctx = defineContext({
         beans: { foo: bean(Foo) },
         expose: ["foo"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const result = collectContexts(parsed);

    expect(result.contexts).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-005");
    expect(result.diagnostics[0]!.message).toMatch(/missing curry/);
  });

  it("CDI-005 fires when beans is missing", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext } from "clean-di";
       export const ctx = defineContext()({
         expose: ["foo"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const result = collectContexts(parsed);

    expect(result.contexts).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-005");
    expect(result.diagnostics[0]!.message).toMatch(/beans/);
  });

  it("CDI-005 fires when expose is missing", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Foo {}
       export const ctx = defineContext()({
         beans: { foo: bean(Foo) },
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const result = collectContexts(parsed);

    expect(result.contexts).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-005");
    expect(result.diagnostics[0]!.message).toMatch(/expose/);
  });

  it("CDI-005 fires when beans is not an object literal", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Foo {}
       const sharedBeans = { foo: bean(Foo) };
       export const ctx = defineContext()({
         beans: sharedBeans,
         expose: ["foo"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const result = collectContexts(parsed);

    expect(result.contexts).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-005");
    expect(result.diagnostics[0]!.message).toMatch(/beans/);
  });

  it("emits CDI-009 when the config type cannot be resolved", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Foo {}
       // MissingConfig is intentionally not imported and not declared.
       export const ctx = defineContext<MissingConfig>()({
         beans: { foo: bean(Foo) },
         expose: ["foo"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const result = collectContexts(parsed);

    expect(result.contexts).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-009");
    expect(result.diagnostics[0]!.message).toMatch(/MissingConfig/);
  });

  it("does NOT emit CDI-009 when TConfig is omitted (void)", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Foo {}
       export const ctx = defineContext()({
         beans: { foo: bean(Foo) },
         expose: ["foo"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const result = collectContexts(parsed);

    expect(result.diagnostics).toEqual([]);
    expect(result.contexts).toHaveLength(1);
    expect(result.contexts[0]!.configTypeName).toBe("void");
  });

  it("does NOT emit CDI-009 when TConfig is the `void` keyword", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Foo {}
       export const ctx = defineContext<void>()({
         beans: { foo: bean(Foo) },
         expose: ["foo"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const result = collectContexts(parsed);

    expect(result.diagnostics).toEqual([]);
    expect(result.contexts).toHaveLength(1);
    expect(result.contexts[0]!.configTypeName).toBe("void");
  });

  it("does NOT emit CDI-009 when TConfig is `any` or `unknown` (intentional)", async () => {
    const {
      program: programAny,
      filePath: filePathAny,
      cleanup: cleanupAny,
    } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Foo {}
       export const ctx = defineContext<any>()({
         beans: { foo: bean(Foo) },
         expose: ["foo"] as const,
       });`,
    );

    const parsedAny = parseDiFile(programAny, filePathAny);
    const resultAny = collectContexts(parsedAny);
    expect(resultAny.diagnostics).toEqual([]);
    expect(resultAny.contexts).toHaveLength(1);
    expect(resultAny.contexts[0]!.configTypeName).toBe("any");
    await cleanupAny();

    const {
      program: programUnknown,
      filePath: filePathUnknown,
      cleanup: cleanupUnknown,
    } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Foo {}
       export const ctx = defineContext<unknown>()({
         beans: { foo: bean(Foo) },
         expose: ["foo"] as const,
       });`,
    );
    cleanupFn = cleanupUnknown;

    const parsedUnknown = parseDiFile(programUnknown, filePathUnknown);
    const resultUnknown = collectContexts(parsedUnknown);
    expect(resultUnknown.diagnostics).toEqual([]);
    expect(resultUnknown.contexts).toHaveLength(1);
    expect(resultUnknown.contexts[0]!.configTypeName).toBe("unknown");
  });

  it("emits CDI-007 for a plain object RHS", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext } from "clean-di";
       export const ctx = defineContext()({
         beans: {
           foo: { fake: true },
         },
         expose: [] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const result = collectContexts(parsed);

    expect(result.contexts).toHaveLength(1);
    expect(result.contexts[0]!.beans).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-007");
    expect(result.diagnostics[0]!.message).toMatch(/foo/);
  });

  it("emits CDI-007 for an arrow-function RHS", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext } from "clean-di";
       export const ctx = defineContext()({
         beans: {
           baz: () => 42,
         },
         expose: [] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const result = collectContexts(parsed);

    expect(result.contexts).toHaveLength(1);
    expect(result.contexts[0]!.beans).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-007");
    expect(result.diagnostics[0]!.message).toMatch(/baz/);
  });

  it("emits CDI-007 for a non-bean / non-provide RHS (class reference and raw call)", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext } from "clean-di";
       class SomeClass {
         private readonly tag = "x";
         use(): void { void this.tag; }
       }
       function makeThing(): number { return 1; }
       export const ctx = defineContext()({
         beans: {
           bar: SomeClass,
           qux: makeThing(),
         },
         expose: [] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const result = collectContexts(parsed);

    expect(result.contexts).toHaveLength(1);
    expect(result.contexts[0]!.beans).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["CDI-007", "CDI-007"]);
    expect(result.diagnostics[0]!.message).toMatch(/bar/);
    expect(result.diagnostics[1]!.message).toMatch(/qux/);
  });

  it("valid bean(...) and provide(...) entries pass without CDI-007", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean, provide } from "clean-di";
       class Foo {}
       export const ctx = defineContext()({
         beans: {
           foo: bean(Foo),
           pi: provide(() => Math.PI),
         },
         expose: ["foo", "pi"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const result = collectContexts(parsed);

    expect(result.diagnostics).toEqual([]);
    expect(result.contexts).toHaveLength(1);
    expect(result.contexts[0]!.beans.map((b) => b.name)).toEqual(["foo", "pi"]);
    expect(result.contexts[0]!.beans.map((b) => b.kind)).toEqual(["bean", "provide"]);
  });

  it("emits CDI-007 only for invalid entries — valid ones in the same context still pass through", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Foo {}
       export const ctx = defineContext()({
         beans: {
           foo: bean(Foo),
           bogus: { not: "a bean" },
         },
         expose: ["foo"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const result = collectContexts(parsed);

    expect(result.contexts).toHaveLength(1);
    expect(result.contexts[0]!.beans.map((b) => b.name)).toEqual(["foo"]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-007");
    expect(result.diagnostics[0]!.message).toMatch(/bogus/);
  });

  it("still returns well-formed contexts alongside malformed ones", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class A {}
       class B {}
       export const good = defineContext()({
         beans: { a: bean(A) },
         expose: ["a"] as const,
       });
       export const bad = defineContext()({
         beans: { b: bean(B) },
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = collectContexts(parsed);

    expect(result.contexts).toHaveLength(1);
    expect(result.contexts[0]!.exportName).toBe("good");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-005");

    warnSpy.mockRestore();
  });
});
