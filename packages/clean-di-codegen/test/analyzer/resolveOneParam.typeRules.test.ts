import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

import { buildBeanScope } from "../../src/analyzer/buildBeanScope";
import { collectContexts } from "../../src/analyzer/collectContexts";
import { parseDiFile } from "../../src/analyzer/parseDiFile";
import { resolveOneParam } from "../../src/analyzer/resolveOneParam";

async function buildFixture(
  diSource: string,
): Promise<{ program: ts.Program; filePath: string; cleanup: () => Promise<void> }> {
  const root = join(tmpdir(), `clean-di-typerules-test-${Date.now()}-${Math.random()}`);
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

describe("resolveOneParam() — DESIGN §7.4 type rules", () => {
  let cleanupFn: (() => Promise<void>) | null = null;
  afterEach(async () => {
    if (cleanupFn !== null) await cleanupFn();
    cleanupFn = null;
  });

  it("generic invariance: `Repository<Post>` does not match `Repository<Comment>`", async () => {
    // Generic class with a nominal private member so distinct instantiations
    // stay structurally separable. `Post` and `Comment` are nominal too.
    // Only `postsRepo` (Repository<Post>) is assignable to the param of type
    // `Repository<Post>`. `commentsRepo` (Repository<Comment>) must NOT match.
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Post { private readonly _post = "post"; }
       export class Comment { private readonly _comment = "comment"; }
       export class Repository<T> {
         private readonly _tag = "repo";
         constructor(public readonly _phantom?: T) {}
         findAll(): T[] { return []; }
       }
       export class PostsRepo extends Repository<Post> { private readonly _posts = "posts"; }
       export class CommentsRepo extends Repository<Comment> { private readonly _comments = "comments"; }
       export class UseCase {
         private readonly _uc = "uc";
         constructor(public repo: Repository<Post>) {}
       }
       export const ctx = defineContext()({
         beans: {
           postsRepo: bean(PostsRepo),
           commentsRepo: bean(CommentsRepo),
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

    expect(result.beanName).toBe("postsRepo");
    expect(result.diagnostics).toHaveLength(0);
  });

  it("union subtype: a bean of type `A` satisfies a parameter of type `A | B`", async () => {
    // DESIGN §7.4: a subtype satisfies its supertype. `A` is a subtype of
    // `A | B`, so a bean of type `A` should be picked up as the single match.
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class A { private readonly _a = "a"; doA(): void {} }
       export class B { private readonly _b = "b"; doB(): void {} }
       export class UseCase {
         private readonly _uc = "uc";
         constructor(public param: A | B) {}
       }
       export const ctx = defineContext()({
         beans: {
           aBean: bean(A),
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

    expect(result.beanName).toBe("aBean");
    expect(result.diagnostics).toHaveLength(0);
  });

  it("any parameter: refuses with CDI-002 (never silently matches all beans)", async () => {
    // Multiple beans in scope. A naive `isTypeAssignableTo` check would match
    // every one of them against `any`. The guard must refuse outright.
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Logger { private readonly _l = "log"; log(): void {} }
       export class Database { private readonly _db = "db"; query(): void {} }
       export class UseCase {
         private readonly _uc = "uc";
         constructor(public thing: any) {}
       }
       export const ctx = defineContext()({
         beans: {
           logger: bean(Logger),
           database: bean(Database),
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
    expect(result.diagnostics[0]!.message).toMatch(/any/);
    expect(result.diagnostics[0]!.message).toMatch(/thing/);
  });

  it("never parameter: refuses with CDI-002 (uninhabited type cannot be satisfied)", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Logger { private readonly _l = "log"; log(): void {} }
       export class UseCase {
         private readonly _uc = "uc";
         constructor(public thing: never) {}
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

    expect(result.beanName).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-002");
    expect(result.diagnostics[0]!.message).toMatch(/never/);
    expect(result.diagnostics[0]!.message).toMatch(/thing/);
  });

  it("optional `?:` parameter without a match is silently skipped (DESIGN §7.4)", async () => {
    // Regression cover for §7.4 rule 3: a `?:` param with no candidate in
    // scope is dropped quietly — no diagnostic, no resolution.
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext, bean } from "clean-di";
       export class Logger { private readonly _l = "log"; log(): void {} }
       export class Tracer { private readonly _t = "trace"; trace(): void {} }
       export class UseCase {
         private readonly _uc = "uc";
         constructor(public logger: Logger, public tracer?: Tracer) {}
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
      param: params[1]!,
      scope,
      checker,
      ownerEntry: undefined,
    });

    expect(result.beanName).toBeNull();
    expect(result.skippedAsOptional).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });
});
