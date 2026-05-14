import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import ts from "typescript";

import { buildBeanScope } from "../../src/analyzer/buildBeanScope";
import { collectContexts } from "../../src/analyzer/collectContexts";
import { parseDiFile } from "../../src/analyzer/parseDiFile";

async function buildFixture(
  diSource: string,
): Promise<{ program: ts.Program; filePath: string; cleanup: () => Promise<void> }> {
  const root = join(tmpdir(), `clean-di-scope-test-${Date.now()}-${Math.random()}`);
  const cleanDiDir = join(root, "node_modules", "clean-di", "src", "public");
  await mkdir(cleanDiDir, { recursive: true });

  // Type-preserving stubs so the type checker sees realistic types during
  // analysis (matching the real `clean-di` package's behavior).
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

describe("buildBeanScope() — MVP, locals only", () => {
  let cleanupFn: (() => Promise<void>) | null = null;
  afterEach(async () => {
    if (cleanupFn !== null) await cleanupFn();
    cleanupFn = null;
  });

  it("indexes local beans by name with the correct kind", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean, provide } from "clean-di";
       class Foo {}
       class Bar { constructor(public foo: Foo) {} }
       export const ctx = defineContext()({
         beans: {
           foo: bean(Foo),
           bar: bean(Bar),
           id: provide(() => "fixed-id"),
         },
         expose: ["foo"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed)[0]!;
    const scope = buildBeanScope(program.getTypeChecker(), ctx);

    expect(Array.from(scope.keys())).toEqual(["foo", "bar", "id"]);
    expect(scope.get("foo")!.kind).toBe("bean");
    expect(scope.get("bar")!.kind).toBe("bean");
    expect(scope.get("id")!.kind).toBe("provide");
  });

  it("captures the class declaration for bean(Class)", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Logger {}
       export const ctx = defineContext()({
         beans: { logger: bean(Logger) },
         expose: ["logger"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed)[0]!;
    const scope = buildBeanScope(program.getTypeChecker(), ctx);

    const loggerEntry = scope.get("logger")!;
    expect(loggerEntry.classDeclaration).toBeDefined();
    expect(loggerEntry.classDeclaration!.name?.text).toBe("Logger");
    expect(loggerEntry.classSymbol).toBeDefined();
  });

  it("captures the overrides map for bean(Class, overrides)", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class Repo {}
       class UseCase { constructor(public repo: Repo) {} }
       export const ctx = defineContext()({
         beans: {
           repo: bean(Repo),
           useCase: bean(UseCase, { repo: "repo" }),
         },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed)[0]!;
    const scope = buildBeanScope(program.getTypeChecker(), ctx);

    expect(scope.get("useCase")!.overrides).toEqual({ repo: "repo" });
    expect(scope.get("repo")!.overrides).toEqual({});
  });

  it("captures the provide() return type", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, provide } from "clean-di";
       export const ctx = defineContext()({
         beans: {
           name: provide(() => "alice"),
         },
         expose: ["name"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed)[0]!;
    const scope = buildBeanScope(program.getTypeChecker(), ctx);

    const entry = scope.get("name")!;
    expect(entry.kind).toBe("provide");
    expect(entry.provideType).toBeDefined();
    // The return type should be `string` literal "alice" or `string` — accept either.
    const checker = program.getTypeChecker();
    const typeText = checker.typeToString(entry.provideType!);
    expect(typeText === "string" || typeText === `"alice"`).toBe(true);
  });

  it("preserves declaration order via Map iteration", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       class A {}
       class B {}
       class C {}
       export const ctx = defineContext()({
         beans: { c: bean(C), a: bean(A), b: bean(B) },
         expose: ["a"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed)[0]!;
    const scope = buildBeanScope(program.getTypeChecker(), ctx);

    expect(Array.from(scope.keys())).toEqual(["c", "a", "b"]);
  });
});
