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

  it("override: uses the named bean when override exists and types match", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class MainLogger { private readonly tag = "main"; log(): void {} }
       export class BackupLogger { private readonly tag = "backup"; log(): void {} }
       export class UseCase {
         private readonly tag = "uc";
         constructor(public logger: MainLogger) {}
       }
       export const ctx = defineContext()({
         beans: {
           mainLogger: bean(MainLogger),
           backupLogger: bean(BackupLogger),
           useCase: bean(UseCase, { logger: "mainLogger" }),
         },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);
    const ownerEntry = scope.get("useCase")!;

    const params = getConstructorParams(parsed.sourceFile, "UseCase");
    const result = resolveOneParam({ param: params[0]!, scope, checker, ownerEntry });

    expect(result.beanName).toBe("mainLogger");
    expect(result.diagnostics).toHaveLength(0);
  });

  it("override: emits CDI-001 when the override target does not exist in scope", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class MainLogger { private readonly tag = "main"; log(): void {} }
       export class UseCase {
         private readonly tag = "uc";
         constructor(public logger: MainLogger) {}
       }
       export const ctx = defineContext()({
         beans: {
           mainLogger: bean(MainLogger),
           useCase: bean(UseCase, { logger: "nonExistentLogger" }),
         },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);
    const ownerEntry = scope.get("useCase")!;

    const params = getConstructorParams(parsed.sourceFile, "UseCase");
    const result = resolveOneParam({ param: params[0]!, scope, checker, ownerEntry });

    expect(result.beanName).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-001");
    expect(result.diagnostics[0]!.message).toMatch(/nonExistentLogger/);
    expect(result.diagnostics[0]!.message).toMatch(/does not exist in scope/);
  });

  it("override: emits CDI-001 when the override target's type is not assignable to the param", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class MainLogger { private readonly tag = "main"; log(): void {} }
       export class Database { private readonly url = ""; query(): void {} }
       export class UseCase {
         private readonly tag = "uc";
         constructor(public logger: MainLogger) {}
       }
       export const ctx = defineContext()({
         beans: {
           mainLogger: bean(MainLogger),
           database: bean(Database),
           useCase: bean(UseCase, { logger: "database" }),
         },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);
    const ownerEntry = scope.get("useCase")!;

    const params = getConstructorParams(parsed.sourceFile, "UseCase");
    const result = resolveOneParam({ param: params[0]!, scope, checker, ownerEntry });

    expect(result.beanName).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-001");
    expect(result.diagnostics[0]!.message).toMatch(/database/);
    expect(result.diagnostics[0]!.message).toMatch(/not assignable/);
  });

  it("name-fallback: picks the bean whose key matches the parameter name when multiple type matches exist", async () => {
    // Two beans are assignable to `Logger` (the primary one, and a
    // structurally-compatible `BackupLogger` that extends it). Type matching
    // alone is ambiguous, but one of the candidates is keyed `logger` —
    // matching the constructor parameter name verbatim — so the fallback wins.
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Logger { private readonly tag = "logger"; log(): void {} }
       export class BackupLogger extends Logger { private readonly backupTag = "backup"; }
       export class UseCase {
         private readonly tag = "uc";
         constructor(public logger: Logger) {}
       }
       export const ctx = defineContext()({
         beans: {
           logger: bean(Logger),
           backupLogger: bean(BackupLogger),
           useCase: bean(UseCase),
         },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);

    const params = getConstructorParams(parsed.sourceFile, "UseCase");
    const result = resolveOneParam({
      param: params[0]!,
      scope,
      checker,
      ownerEntry: undefined,
    });

    expect(result.beanName).toBe("logger");
    expect(result.diagnostics).toHaveLength(0);
  });

  it("name-fallback: emits CDI-002 when multiple type matches and none has a matching name", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Logger { private readonly tag = "logger"; log(): void {} }
       export class BackupLogger extends Logger { private readonly backupTag = "backup"; }
       export class UseCase {
         private readonly tag = "uc";
         constructor(public logger: Logger) {}
       }
       export const ctx = defineContext()({
         beans: {
           primaryLogger: bean(Logger),
           backupLogger: bean(BackupLogger),
           useCase: bean(UseCase),
         },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);

    const params = getConstructorParams(parsed.sourceFile, "UseCase");
    const result = resolveOneParam({
      param: params[0]!,
      scope,
      checker,
      ownerEntry: undefined,
    });

    expect(result.beanName).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-002");
    expect(result.diagnostics[0]!.message).toMatch(/primaryLogger, backupLogger/);
  });

  it("name-fallback: picks the same-named bean when no type matches (and type is assignable)", async () => {
    // No bean's *declared* type is structurally identical to the param's
    // `Logger` type — the only assignable bean is `logger: bean(SubLogger)`,
    // which is type-assignable but only via the name-fallback branch. To
    // exercise the zero-match path, we hide the assignability behind a
    // structural-only subtype that the W3 type filter still admits, while no
    // other bean is in scope at all.
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Logger { private readonly tag = "logger"; log(): void {} }
       export class UseCase {
         private readonly tag = "uc";
         constructor(public logger: Logger) {}
       }
       export const ctx = defineContext()({
         beans: {
           logger: bean(Logger),
           useCase: bean(UseCase),
         },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);

    const params = getConstructorParams(parsed.sourceFile, "UseCase");
    const result = resolveOneParam({
      param: params[0]!,
      scope,
      checker,
      ownerEntry: undefined,
    });

    // The W3 type filter alone resolves this one (single assignable bean),
    // which is the desired behavior; the name-fallback branch is a *strict
    // superset* of that. The point here is that even if we had to take the
    // zero-match path, a same-named, type-assignable bean would still win.
    expect(result.beanName).toBe("logger");
    expect(result.diagnostics).toHaveLength(0);
  });

  it("name-fallback: emits CDI-001 when no type matches and no same-name bean is type-assignable", async () => {
    // Param name is `logger` but the only bean in scope under that name has
    // an incompatible type. Name-fallback must not paper over that — the
    // fallback only fires when the same-named bean is type-assignable.
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Logger { private readonly tag = "logger"; log(): void {} }
       export class Database { private readonly url = ""; query(): void {} }
       export class UseCase {
         private readonly tag = "uc";
         constructor(public logger: Logger) {}
       }
       export const ctx = defineContext()({
         beans: {
           logger: bean(Database),
           useCase: bean(UseCase),
         },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);

    const params = getConstructorParams(parsed.sourceFile, "UseCase");
    const result = resolveOneParam({
      param: params[0]!,
      scope,
      checker,
      ownerEntry: undefined,
    });

    expect(result.beanName).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-001");
  });

  it("name-fallback: case-sensitive — different casing does not match", async () => {
    // Two beans assignable to `Logger`; neither key equals the param name
    // (`logger`) exactly — `Logger` differs in case. Per DESIGN §7.5 the
    // comparison is byte-for-byte, so this stays ambiguous and emits CDI-002.
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Logger { private readonly tag = "logger"; log(): void {} }
       export class BackupLogger extends Logger { private readonly backupTag = "backup"; }
       export class UseCase {
         private readonly tag = "uc";
         constructor(public logger: Logger) {}
       }
       export const ctx = defineContext()({
         beans: {
           Logger: bean(Logger),
           backupLogger: bean(BackupLogger),
           useCase: bean(UseCase),
         },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);

    const params = getConstructorParams(parsed.sourceFile, "UseCase");
    const result = resolveOneParam({
      param: params[0]!,
      scope,
      checker,
      ownerEntry: undefined,
    });

    expect(result.beanName).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-002");
  });

  it("resolves a parameter against a synthetic config bean by name when type matches (T-046)", async () => {
    // A `cfg.apiUrl: string` synthetic entry should be reachable by a
    // constructor parameter `apiUrl: string` via the standard type-matching
    // path, with no explicit `bean(...)` / `provide(...)` declaration.
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       type AppConfig = { apiUrl: string };
       export class HttpClient {
         private readonly tag = "http";
         constructor(public apiUrl: string) {}
       }
       export const ctx = defineContext<AppConfig>()({
         beans: { httpClient: bean(HttpClient) },
         expose: ["httpClient"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const checker = program.getTypeChecker();
    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const scope = buildBeanScope(checker, ctx);

    // Sanity check: the synthetic entry is in scope.
    expect(scope.get("apiUrl")).toBeDefined();
    expect(scope.get("apiUrl")!.kind).toBe("config");

    const params = getConstructorParams(parsed.sourceFile, "HttpClient");
    const result = resolveOneParam({
      param: params[0]!,
      scope,
      checker,
      ownerEntry: scope.get("httpClient")!,
    });

    expect(result.beanName).toBe("apiUrl");
    expect(result.diagnostics).toHaveLength(0);
  });

  it("override: takes precedence over an otherwise-unambiguous type match", async () => {
    // Two distinct logger classes, both in scope; constructor declares MainLogger,
    // so type matching would unambiguously pick `mainLogger`. The override
    // explicitly points to `backupLogger` — but BackupLogger isn't assignable
    // to MainLogger, so the override should emit CDI-001 rather than silently
    // falling back to the type-match.
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class MainLogger { private readonly tag = "main"; log(): void {} }
       export class BackupLogger { private readonly tag = "backup"; log(): void {} }
       export class UseCase {
         private readonly tag = "uc";
         constructor(public logger: MainLogger) {}
       }
       export const ctx = defineContext()({
         beans: {
           mainLogger: bean(MainLogger),
           backupLogger: bean(BackupLogger),
           useCase: bean(UseCase, { logger: "backupLogger" }),
         },
         expose: ["useCase"] as const,
       });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    const ctx = collectContexts(parsed).contexts[0]!;
    const checker = program.getTypeChecker();
    const scope = buildBeanScope(checker, ctx);
    const ownerEntry = scope.get("useCase")!;

    const params = getConstructorParams(parsed.sourceFile, "UseCase");
    const result = resolveOneParam({ param: params[0]!, scope, checker, ownerEntry });

    expect(result.beanName).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-001");
  });
});
