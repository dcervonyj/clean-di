import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import ts from "typescript";

import { buildBeanScopeWithImports } from "../../src/analyzer/buildBeanScope";
import { collectContexts } from "../../src/analyzer/collectContexts";
import { parseDiFile } from "../../src/analyzer/parseDiFile";
import { validateExpose } from "../../src/analyzer/validateExpose";

async function buildFixture(
  diSource: string,
): Promise<{ program: ts.Program; filePath: string; cleanup: () => Promise<void> }> {
  const root = join(tmpdir(), `clean-di-validate-expose-test-${Date.now()}-${Math.random()}`);
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

describe("validateExpose() — CDI-004 MissingExposeTarget", () => {
  let cleanupFn: (() => Promise<void>) | null = null;
  afterEach(async () => {
    if (cleanupFn !== null) await cleanupFn();
    cleanupFn = null;
  });

  it("returns no diagnostics when every exposed name is in scope", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Foo {
         private readonly tag = "foo";
       }
       class Bar {
         private readonly tag = "bar";
       }
       export const ctx = defineContext()({
         beans: {
           foo: bean(Foo),
           bar: bean(Bar),
         },
         expose: ["foo", "bar"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const { scope } = buildBeanScopeWithImports(program.getTypeChecker(), ctx);

    const diagnostics = validateExpose(ctx, scope);
    expect(diagnostics).toEqual([]);
  });

  it("emits CDI-004 for each missing name", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Logger {
         private readonly tag = "logger";
       }
       export const ctx = defineContext()({
         beans: {
           logger: bean(Logger),
         },
         expose: ["logger", "nonExistent"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const { scope } = buildBeanScopeWithImports(program.getTypeChecker(), ctx);

    const diagnostics = validateExpose(ctx, scope);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("CDI-004");
    expect(diagnostics[0]!.message).toContain("nonExistent");
  });

  it("emits multiple CDI-004 when multiple names are missing", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Foo {
         private readonly tag = "foo";
       }
       export const ctx = defineContext()({
         beans: {
           foo: bean(Foo),
         },
         expose: ["foo", "missingA", "missingB"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const { scope } = buildBeanScopeWithImports(program.getTypeChecker(), ctx);

    const diagnostics = validateExpose(ctx, scope);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.every((d) => d.code === "CDI-004")).toBe(true);
    expect(diagnostics[0]!.message).toContain("missingA");
    expect(diagnostics[1]!.message).toContain("missingB");
  });

  it("scope contains imported beans — exposed name from import passes", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, defineConfig, bean } from "clean-di";
       class Logger {
         private readonly tag = "logger";
       }
       class Repo {
         private readonly tag = "repo";
       }
       export const childConfig = defineConfig({
         beans: {
           logger: bean(Logger),
           repo: bean(Repo),
         },
       });
       export const ctx = defineContext()({
         imports: [childConfig],
         beans: {},
         expose: ["repo"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts.find((c) => c.exportName === "ctx")!;
    const { scope } = buildBeanScopeWithImports(program.getTypeChecker(), ctx);

    const diagnostics = validateExpose(ctx, scope);
    expect(diagnostics).toEqual([]);
  });
});
