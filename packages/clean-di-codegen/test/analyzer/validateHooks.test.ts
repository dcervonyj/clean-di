import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

import { buildBeanScopeWithImports } from "../../src/analyzer/buildBeanScope";
import { collectContexts } from "../../src/analyzer/collectContexts";
import { parseDiFile } from "../../src/analyzer/parseDiFile";
import { validateHooks } from "../../src/analyzer/validateHooks";

async function buildFixture(
  diSource: string,
): Promise<{ program: ts.Program; filePath: string; cleanup: () => Promise<void> }> {
  const root = join(tmpdir(), `clean-di-validate-hooks-test-${Date.now()}-${Math.random()}`);
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

async function runValidate(source: string): Promise<{
  diagnostics: readonly { code: string; message: string }[];
  cleanup: () => Promise<void>;
}> {
  const { program, filePath, cleanup } = await buildFixture(source);
  const parsed = parseDiFile(program, filePath);
  const ctx = collectContexts(parsed).contexts[0]!;
  const { scope } = buildBeanScopeWithImports(program.getTypeChecker(), ctx);

  const diagnostics = validateHooks(ctx, scope, program.getTypeChecker()).map((d) => ({
    code: d.code,
    message: d.message,
  }));

  return { diagnostics, cleanup };
}

describe("validateHooks() — CDI-014", () => {
  let cleanupFn: (() => Promise<void>) | null = null;
  afterEach(async () => {
    if (cleanupFn !== null) await cleanupFn();
    cleanupFn = null;
  });

  it("passes a correctly-shaped postConstruct that destructures a real bean", async () => {
    const { diagnostics, cleanup } = await runValidate(
      `import { defineContext, bean } from "clean-di";
       class Greeter { init(): void {} }
       export const ctx = defineContext()({
         beans: { greeter: bean(Greeter) },
         postConstruct: ({ greeter }: { greeter: Greeter }) => { greeter.init(); },
         expose: ["greeter"] as const,
       });`,
    );
    cleanupFn = cleanup;

    expect(diagnostics).toEqual([]);
  });

  it("passes async hooks returning Promise<void>", async () => {
    const { diagnostics, cleanup } = await runValidate(
      `import { defineContext, bean } from "clean-di";
       class Greeter { async init(): Promise<void> {} }
       export const ctx = defineContext()({
         beans: { greeter: bean(Greeter) },
         postConstruct: async ({ greeter }: { greeter: Greeter }) => { await greeter.init(); },
         expose: ["greeter"] as const,
       });`,
    );
    cleanupFn = cleanup;

    expect(diagnostics).toEqual([]);
  });

  it("emits CDI-014 when the destructured property references a bean that doesn't exist", async () => {
    const { diagnostics, cleanup } = await runValidate(
      `import { defineContext, bean } from "clean-di";
       class Greeter {}
       export const ctx = defineContext()({
         beans: { greeter: bean(Greeter) },
         postConstruct: ({ missingBean }: { missingBean: { init: () => void } }) => {
           missingBean.init();
         },
         expose: ["greeter"] as const,
       });`,
    );
    cleanupFn = cleanup;

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("CDI-014");
    expect(diagnostics[0]!.message).toContain("missingBean");
  });

  it("emits CDI-014 when the first param is typed as a primitive (cannot accept beans bag)", async () => {
    const { diagnostics, cleanup } = await runValidate(
      `import { defineContext, bean } from "clean-di";
       class Greeter {}
       export const ctx = defineContext()({
         beans: { greeter: bean(Greeter) },
         postConstruct: (x: number) => { void x; },
         expose: ["greeter"] as const,
       });`,
    );
    cleanupFn = cleanup;

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("CDI-014");
  });

  it("emits CDI-014 when the destructured bean is annotated with a non-assignable type", async () => {
    const { diagnostics, cleanup } = await runValidate(
      `import { defineContext, bean } from "clean-di";
       class Greeter { init(): void {} }
       export const ctx = defineContext()({
         beans: { greeter: bean(Greeter) },
         // greeter is a class, but here we annotate it as string.
         postConstruct: ({ greeter }: { greeter: string }) => { void greeter; },
         expose: ["greeter"] as const,
       });`,
    );
    cleanupFn = cleanup;

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("CDI-014");
    expect(diagnostics[0]!.message).toContain("greeter");
  });

  it("accepts hooks whose first param is typed as `any` (explicit opt-out)", async () => {
    const { diagnostics, cleanup } = await runValidate(
      `import { defineContext, bean } from "clean-di";
       class Greeter {}
       export const ctx = defineContext()({
         beans: { greeter: bean(Greeter) },
         postConstruct: (bag: any) => { void bag; },
         expose: ["greeter"] as const,
       });`,
    );
    cleanupFn = cleanup;

    expect(diagnostics).toEqual([]);
  });

  it("emits CDI-014 when the hook value is a primitive (not callable)", async () => {
    const { diagnostics, cleanup } = await runValidate(
      `import { defineContext, bean } from "clean-di";
       class Greeter {}
       const notAHook = 42;
       export const ctx = defineContext()({
         beans: { greeter: bean(Greeter) },
         postConstruct: notAHook,
         expose: ["greeter"] as const,
       });`,
    );
    cleanupFn = cleanup;

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("CDI-014");
    expect(diagnostics[0]!.message).toContain("not callable");
  });

  it("accepts a correct two-arg hook against a non-void TConfig", async () => {
    const { diagnostics, cleanup } = await runValidate(
      `import { defineContext, bean } from "clean-di";
       interface Cfg { readonly apiBase: string; }
       class Greeter {}
       export const ctx = defineContext<Cfg>()({
         beans: { greeter: bean(Greeter) },
         postConstruct: ({ greeter }: { greeter: Greeter }, cfg: Cfg) => { void greeter; void cfg; },
         expose: ["greeter"] as const,
       });`,
    );
    cleanupFn = cleanup;

    expect(diagnostics).toEqual([]);
  });

  it("emits CDI-014 when the second param is incompatible with TConfig", async () => {
    const { diagnostics, cleanup } = await runValidate(
      `import { defineContext, bean } from "clean-di";
       interface Cfg { readonly apiBase: string; }
       class Greeter {}
       export const ctx = defineContext<Cfg>()({
         beans: { greeter: bean(Greeter) },
         postConstruct: ({ greeter }: { greeter: Greeter }, cfg: { somethingElse: number }) => {
           void greeter; void cfg;
         },
         expose: ["greeter"] as const,
       });`,
    );
    cleanupFn = cleanup;

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("CDI-014");
    expect(diagnostics[0]!.message).toContain("second parameter");
  });

  it("validates a destructured `provide` bean shape", async () => {
    const { diagnostics, cleanup } = await runValidate(
      `import { defineContext, bean, provide } from "clean-di";
       class Greeter {}
       export const ctx = defineContext()({
         beans: {
           greeter: bean(Greeter),
           apiBase: provide<string>(() => "https://example.com"),
         },
         postConstruct: ({ greeter, apiBase }: { greeter: Greeter; apiBase: string }) => {
           void greeter; void apiBase;
         },
         expose: ["greeter"] as const,
       });`,
    );
    cleanupFn = cleanup;

    expect(diagnostics).toEqual([]);
  });

  it("validates preDestroy independently from postConstruct", async () => {
    const { diagnostics, cleanup } = await runValidate(
      `import { defineContext, bean } from "clean-di";
       class Greeter { dispose(): void {} }
       export const ctx = defineContext()({
         beans: { greeter: bean(Greeter) },
         preDestroy: ({ unknownBean }: { unknownBean: { dispose: () => void } }) => {
           unknownBean.dispose();
         },
         expose: ["greeter"] as const,
       });`,
    );
    cleanupFn = cleanup;

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("CDI-014");
    expect(diagnostics[0]!.message).toContain("preDestroy");
  });

  it("returns no diagnostics when no hooks are declared", async () => {
    const { diagnostics, cleanup } = await runValidate(
      `import { defineContext, bean } from "clean-di";
       class Greeter {}
       export const ctx = defineContext()({
         beans: { greeter: bean(Greeter) },
         expose: ["greeter"] as const,
       });`,
    );
    cleanupFn = cleanup;

    expect(diagnostics).toEqual([]);
  });
});
