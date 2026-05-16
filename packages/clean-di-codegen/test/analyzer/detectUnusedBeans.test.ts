import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

import { buildBeanScopeWithImports } from "../../src/analyzer/buildBeanScope";
import { collectContexts } from "../../src/analyzer/collectContexts";
import { detectUnusedBeans } from "../../src/analyzer/detectUnusedBeans";
import { parseDiFile } from "../../src/analyzer/parseDiFile";

async function buildFixture(
  diSource: string,
): Promise<{ program: ts.Program; filePath: string; cleanup: () => Promise<void> }> {
  const root = join(tmpdir(), `clean-di-detect-unused-test-${Date.now()}-${Math.random()}`);
  const cleanDiDir = join(root, "node_modules", "clean-di", "src", "public");
  await mkdir(cleanDiDir, { recursive: true });

  await writeFile(
    join(cleanDiDir, "defineContext.ts"),
    `export function defineContext<TConfig = void>(): (spec: any) => any { return () => undefined as any; }`,
  );
  await writeFile(
    join(cleanDiDir, "defineConfig.ts"),
    `export function defineConfig<T>(spec: T): T { return spec; }`,
  );
  await writeFile(
    join(cleanDiDir, "bean.ts"),
    `export function bean<C extends new (...args: any[]) => any>(Class: C, overrides?: any): InstanceType<C> { return undefined as any; }`,
  );
  await writeFile(
    join(cleanDiDir, "provide.ts"),
    `export function provide<T>(factory: (cfg: any) => T): T { return undefined as any; }`,
  );
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

describe("detectUnusedBeans() — CDI-011", () => {
  let cleanupFn: (() => Promise<void>) | null = null;
  afterEach(async () => {
    if (cleanupFn !== null) await cleanupFn();
    cleanupFn = null;
  });

  it("returns no diagnostics when every bean is reachable from `expose`", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Logger {}
       class Greeter { constructor(public logger: Logger) {} }
       export const ctx = defineContext()({
         beans: {
           logger: bean(Logger),
           greeter: bean(Greeter),
         },
         expose: ["greeter"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const { scope } = buildBeanScopeWithImports(program.getTypeChecker(), ctx);

    const diagnostics = detectUnusedBeans({
      scope,
      graph: new Map([
        ["logger", []],
        ["greeter", ["logger"]],
      ]),
      expose: ctx.expose,
    });

    expect(diagnostics).toEqual([]);
  });

  it("flags a bean that is declared but never referenced", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Logger {}
       class Greeter {}
       class Orphan {}
       export const ctx = defineContext()({
         beans: {
           logger: bean(Logger),
           greeter: bean(Greeter),
           orphan: bean(Orphan),
         },
         expose: ["greeter"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const { scope } = buildBeanScopeWithImports(program.getTypeChecker(), ctx);

    const diagnostics = detectUnusedBeans({
      scope,
      graph: new Map([
        ["logger", []],
        ["greeter", []],
        ["orphan", []],
      ]),
      expose: ctx.expose,
    });

    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain("CDI-011");
    // Both `logger` and `orphan` are unreachable here.
    const messages = diagnostics.map((d) => d.message);
    expect(messages.some((m) => m.includes("orphan"))).toBe(true);
    expect(messages.some((m) => m.includes("logger"))).toBe(true);
  });

  it("does not flag transitively used beans", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class A {}
       class B { constructor(public a: A) {} }
       class C { constructor(public b: B) {} }
       export const ctx = defineContext()({
         beans: {
           a: bean(A),
           b: bean(B),
           c: bean(C),
         },
         expose: ["c"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const { scope } = buildBeanScopeWithImports(program.getTypeChecker(), ctx);

    const diagnostics = detectUnusedBeans({
      scope,
      graph: new Map([
        ["a", []],
        ["b", ["a"]],
        ["c", ["b"]],
      ]),
      expose: ctx.expose,
    });

    expect(diagnostics).toEqual([]);
  });

  it("never reports synthetic `config` beans", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       interface Cfg { readonly apiBase: string; }
       class Greeter {}
       export const ctx = defineContext<Cfg>()({
         beans: {
           greeter: bean(Greeter),
         },
         expose: ["greeter"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const { scope } = buildBeanScopeWithImports(program.getTypeChecker(), ctx);

    // `apiBase` is a synthetic config bean — it must never be flagged even
    // though nothing reaches it.
    const diagnostics = detectUnusedBeans({
      scope,
      graph: new Map([
        ["apiBase", []],
        ["greeter", []],
      ]),
      expose: ctx.expose,
    });

    expect(diagnostics.map((d) => d.code)).not.toContain("CDI-011");
  });

  it("warning severity for the emitted diagnostic", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class A {}
       class B {}
       export const ctx = defineContext()({
         beans: { a: bean(A), b: bean(B) },
         expose: ["a"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const { scope } = buildBeanScopeWithImports(program.getTypeChecker(), ctx);

    const diagnostics = detectUnusedBeans({
      scope,
      graph: new Map([
        ["a", []],
        ["b", []],
      ]),
      expose: ctx.expose,
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("CDI-011");
    expect(diagnostics[0]!.message).toContain("'b'");
  });
});
