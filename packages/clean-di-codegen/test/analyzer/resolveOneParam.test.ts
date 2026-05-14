import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import ts from "typescript";

import { buildBeanScope } from "../../src/analyzer/buildBeanScope";
import { collectContexts } from "../../src/analyzer/collectContexts";
import { parseDiFile } from "../../src/analyzer/parseDiFile";
import { resolveOneParam } from "../../src/analyzer/resolveOneParam";

async function buildFixture(
  diSource: string,
): Promise<{ program: ts.Program; filePath: string; cleanup: () => Promise<void> }> {
  const root = join(tmpdir(), `clean-di-resolve-test-${Date.now()}-${Math.random()}`);
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

/** Helper: given a parsed fixture, get the named class's constructor params. */
function getConstructorParams(
  sourceFile: ts.SourceFile,
  className: string,
): readonly ts.ParameterDeclaration[] {
  let params: readonly ts.ParameterDeclaration[] = [];

  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      for (const member of node.members) {
        if (ts.isConstructorDeclaration(member)) {
          params = member.parameters;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return params;
}

describe("resolveOneParam() — MVP, type matching only", () => {
  let cleanupFn: (() => Promise<void>) | null = null;
  afterEach(async () => {
    if (cleanupFn !== null) await cleanupFn();
    cleanupFn = null;
  });

  it("resolves a parameter when exactly one bean type matches", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      // Classes have distinct private members so TypeScript treats them as
      // nominally different (empty classes are structurally identical).
      `import { defineContext, bean } from "clean-di";
       export class Logger { private readonly tag = "logger"; log(): void {} }
       export class UseCase {
         private readonly tag = "use-case";
         constructor(public logger: Logger) {}
         run(): void {}
       }
       export const ctx = defineContext()({
         beans: { logger: bean(Logger), useCase: bean(UseCase) },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);

    const params = getConstructorParams(parsed.sourceFile, "UseCase");
    const result = resolveOneParam({ param: params[0]!, scope, checker });

    expect(result.beanName).toBe("logger");
    expect(result.diagnostics).toHaveLength(0);
  });

  it("emits CDI-001 when no bean matches a required parameter", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Logger { private readonly tag = "logger"; log(): void {} }
       export class Database { private readonly url = ""; query(): void {} }
       export class UseCase {
         private readonly tag = "use-case";
         constructor(public db: Database) {}
       }
       export const ctx = defineContext()({
         beans: { logger: bean(Logger), useCase: bean(UseCase) },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);

    const params = getConstructorParams(parsed.sourceFile, "UseCase");
    const result = resolveOneParam({ param: params[0]!, scope, checker });

    expect(result.beanName).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-001");
  });

  it("emits CDI-002 when multiple beans match the parameter type", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Logger {}
       export class UseCase { constructor(public logger: Logger) {} }
       export const ctx = defineContext()({
         beans: { a: bean(Logger), b: bean(Logger), useCase: bean(UseCase) },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);

    const params = getConstructorParams(parsed.sourceFile, "UseCase");
    const result = resolveOneParam({ param: params[0]!, scope, checker });

    expect(result.beanName).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-002");
    expect(result.diagnostics[0]!.message).toMatch(/a, b/);
  });

  it("skips optional parameters silently when no bean matches", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Logger {}
       export class UseCase { constructor(public logger: Logger, public extra?: number) {} }
       export const ctx = defineContext()({
         beans: { logger: bean(Logger), useCase: bean(UseCase) },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);

    const params = getConstructorParams(parsed.sourceFile, "UseCase");
    // params[1] is the optional `extra?: number` — no `number` bean in scope.
    const result = resolveOneParam({ param: params[1]!, scope, checker });

    expect(result.beanName).toBeNull();
    expect(result.skippedAsOptional).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("treats default-valued params as optional (no diagnostic when unresolvable)", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Logger {}
       export class UseCase { constructor(public logger: Logger, public extra: number = 42) {} }
       export const ctx = defineContext()({
         beans: { logger: bean(Logger), useCase: bean(UseCase) },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);

    const params = getConstructorParams(parsed.sourceFile, "UseCase");
    const result = resolveOneParam({ param: params[1]!, scope, checker });

    expect(result.skippedAsOptional).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });
});
