import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import ts from "typescript";

import { buildBeanScope } from "../../src/analyzer/buildBeanScope";
import { collectContexts } from "../../src/analyzer/collectContexts";
import { parseDiFile } from "../../src/analyzer/parseDiFile";
import { resolveConstructor } from "../../src/analyzer/resolveConstructor";

async function buildFixture(
  diSource: string,
): Promise<{ program: ts.Program; filePath: string; cleanup: () => Promise<void> }> {
  const root = join(tmpdir(), `clean-di-resolvector-test-${Date.now()}-${Math.random()}`);
  const cleanDiDir = join(root, "node_modules", "clean-di", "src", "public");
  await mkdir(cleanDiDir, { recursive: true });

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

function findClass(sourceFile: ts.SourceFile, name: string): ts.ClassDeclaration {
  let result: ts.ClassDeclaration | null = null;
  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node) && node.name?.text === name) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (result === null) {
    throw new Error(`fixture: class ${name} not found`);
  }
  return result;
}

describe("resolveConstructor()", () => {
  let cleanupFn: (() => Promise<void>) | null = null;
  afterEach(async () => {
    if (cleanupFn !== null) await cleanupFn();
    cleanupFn = null;
  });

  it("returns [] for a class with no explicit constructor", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Standalone { private readonly tag = "x"; run(): void {} }
       export const ctx = defineContext()({
         beans: { x: bean(Standalone) },
         expose: ["x"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed)[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);
    const cls = findClass(parsed.sourceFile, "Standalone");

    const result = resolveConstructor({ classDeclaration: cls, scope, checker });

    expect(result.args).toEqual([]);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.refused).toBe(false);
  });

  it("returns [] for a zero-arg explicit constructor", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Zero {
         private readonly tag = "zero";
         constructor() {}
         run(): void {}
       }
       export const ctx = defineContext()({
         beans: { x: bean(Zero) },
         expose: ["x"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed)[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);
    const cls = findClass(parsed.sourceFile, "Zero");

    const result = resolveConstructor({ classDeclaration: cls, scope, checker });

    expect(result.args).toEqual([]);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("returns args in positional order for a multi-param constructor", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Logger { private readonly tag = "logger"; log(): void {} }
       export class Repo { private readonly tag = "repo"; find(): void {} }
       export class UseCase {
         private readonly tag = "use-case";
         constructor(public logger: Logger, public repo: Repo) {}
         run(): void {}
       }
       export const ctx = defineContext()({
         beans: { logger: bean(Logger), repo: bean(Repo), useCase: bean(UseCase) },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed)[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);
    const cls = findClass(parsed.sourceFile, "UseCase");

    const result = resolveConstructor({ classDeclaration: cls, scope, checker });

    expect(result.args).toEqual(["logger", "repo"]);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.refused).toBe(false);
  });

  it("refuses private constructors with CDI-008", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Factoryish {
         private readonly tag = "f";
         private constructor() {}
         static create(): Factoryish { return new Factoryish(); }
       }
       export const ctx = defineContext()({
         beans: { x: bean(Factoryish) },
         expose: ["x"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed)[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);
    const cls = findClass(parsed.sourceFile, "Factoryish");

    const result = resolveConstructor({ classDeclaration: cls, scope, checker });

    expect(result.refused).toBe(true);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-008");
    expect(result.diagnostics[0]!.message).toMatch(/private or protected/i);
  });

  it("refuses protected constructors with CDI-008", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Base {
         private readonly tag = "b";
         protected constructor() {}
       }
       export const ctx = defineContext()({
         beans: { x: bean(Base) },
         expose: ["x"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed)[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);
    const cls = findClass(parsed.sourceFile, "Base");

    const result = resolveConstructor({ classDeclaration: cls, scope, checker });

    expect(result.refused).toBe(true);
    expect(result.diagnostics[0]!.code).toBe("CDI-008");
  });

  it("refuses rest parameters with CDI-008", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Variadic {
         private readonly tag = "v";
         constructor(...things: number[]) {}
       }
       export const ctx = defineContext()({
         beans: { x: bean(Variadic) },
         expose: ["x"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed)[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);
    const cls = findClass(parsed.sourceFile, "Variadic");

    const result = resolveConstructor({ classDeclaration: cls, scope, checker });

    expect(result.refused).toBe(true);
    expect(result.diagnostics[0]!.code).toBe("CDI-008");
    expect(result.diagnostics[0]!.message).toMatch(/rest|spread/i);
  });

  it("refuses destructured parameters with CDI-008", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Destructured {
         private readonly tag = "d";
         constructor({ x, y }: { x: number; y: number }) {}
       }
       export const ctx = defineContext()({
         beans: { x: bean(Destructured) },
         expose: ["x"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed)[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);
    const cls = findClass(parsed.sourceFile, "Destructured");

    const result = resolveConstructor({ classDeclaration: cls, scope, checker });

    expect(result.refused).toBe(true);
    expect(result.diagnostics[0]!.code).toBe("CDI-008");
    expect(result.diagnostics[0]!.message).toMatch(/destructured/i);
  });

  it("propagates CDI-001 from resolveOneParam when a parameter is unresolvable", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Database { private readonly url = ""; query(): void {} }
       export class UseCase {
         private readonly tag = "u";
         constructor(public db: Database) {}
       }
       export const ctx = defineContext()({
         beans: { useCase: bean(UseCase) },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed)[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);
    const cls = findClass(parsed.sourceFile, "UseCase");

    const result = resolveConstructor({ classDeclaration: cls, scope, checker });

    expect(result.refused).toBe(false);
    expect(result.args).toEqual([null]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-001");
  });
});
