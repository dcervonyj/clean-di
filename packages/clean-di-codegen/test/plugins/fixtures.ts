/**
 * Shared helpers for plugin integration tests (T-099).
 *
 * The vite/rollup plugin integration tests run real builds against a temp-dir
 * project. These helpers build that project: a stubbed `clean-di` package
 * (matching the one used by `test/util/loadFixture.ts`), a `tsconfig.json`,
 * a `package.json` with the `cleanDi` config key, plus a configurable set of
 * `.di.ts` source files.
 *
 * Each helper that creates a temp directory returns its absolute path; the
 * caller is responsible for cleanup via `rm(dir, { recursive: true, force:
 * true })`.
 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ProjectFile {
  /** Path relative to the temp project root. */
  readonly relativePath: string;
  readonly contents: string;
}

export interface ProjectFixture {
  /** Files to write under the temp project root. */
  readonly files: readonly ProjectFile[];
}

/**
 * Create a fresh temp directory under `os.tmpdir()` and scaffold a minimal
 * clean-di project inside:
 *
 *   - `package.json` with a `cleanDi` config (include: `**\/*.di.ts`)
 *   - `tsconfig.json` (NodeNext, ES2022, non-strict — matches loadFixture)
 *   - `node_modules/clean-di/...` stubs so `.di.ts` files can `import "clean-di"`
 *   - whatever files the caller passed in `fixture.files`
 *
 * Returns the absolute path to the temp project root.
 */
export async function createTempProject(fixture: ProjectFixture): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "clean-di-plugin-itest-"));
  await stubCleanDi(root);
  await writePackageJson(root);
  await writeTsconfig(root);

  for (const file of fixture.files) {
    const fullPath = join(root, file.relativePath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, file.contents, "utf8");
  }

  return root;
}

/**
 * The `unambiguous` fixture inlined as JS string literals. Mirrors
 * `test/fixtures/unambiguous/*` but kept self-contained so plugin integration
 * tests don't depend on the fixture catalog layout.
 */
export const UNAMBIGUOUS_FIXTURE: ProjectFixture = {
  files: [
    {
      relativePath: "Logger.ts",
      contents: [
        "export class Logger {",
        "  private readonly tag = 'logger';",
        "  log(message: string): void {",
        "    void message;",
        "    void this.tag;",
        "  }",
        "}",
        "",
      ].join("\n"),
    },
    {
      relativePath: "HttpPostsRepository.ts",
      contents: [
        "import type { Logger } from './Logger';",
        "",
        "export class HttpPostsRepository {",
        "  private readonly tag = 'repo';",
        "  constructor(",
        "    public readonly apiBaseUrl: string,",
        "    public readonly logger: Logger,",
        "  ) {",
        "    void this.tag;",
        "  }",
        "  list(): unknown[] {",
        "    return [];",
        "  }",
        "}",
        "",
      ].join("\n"),
    },
    {
      relativePath: "ListPostsUseCase.ts",
      contents: [
        "import type { HttpPostsRepository } from './HttpPostsRepository';",
        "",
        "export class ListPostsUseCase {",
        "  private readonly tag = 'use-case';",
        "  constructor(public readonly repository: HttpPostsRepository) {",
        "    void this.tag;",
        "  }",
        "  execute(): unknown[] {",
        "    return this.repository.list();",
        "  }",
        "}",
        "",
      ].join("\n"),
    },
    {
      relativePath: "input.di.ts",
      contents: [
        "import { defineContext, bean, provide } from 'clean-di';",
        "",
        "import { HttpPostsRepository } from './HttpPostsRepository';",
        "import { ListPostsUseCase } from './ListPostsUseCase';",
        "import { Logger } from './Logger';",
        "",
        "export interface PostsContextConfig {",
        "  readonly apiBaseUrl: string;",
        "}",
        "",
        "export const postsContext = defineContext<PostsContextConfig>()({",
        "  beans: {",
        "    apiBaseUrl: provide<string>((cfg) => cfg.apiBaseUrl),",
        "    logger: bean(Logger),",
        "    postsRepository: bean(HttpPostsRepository),",
        "    listPosts: bean(ListPostsUseCase),",
        "  },",
        "  expose: ['listPosts'] as const,",
        "});",
        "",
      ].join("\n"),
    },
  ],
};

/**
 * Negative fixture that triggers CDI-001 (unresolvable dependency).
 *
 * `UseCase` requires a `Database` constructor arg but no `database` bean is
 * declared, so codegen must emit a diagnostic and runOnce must return a
 * non-zero exit code — which causes the plugin to call `this.error(...)`.
 */
export const UNRESOLVABLE_FIXTURE: ProjectFixture = {
  files: [
    {
      relativePath: "Logger.ts",
      contents: [
        "export class Logger {",
        "  private readonly tag = 'logger';",
        "  log(message: string): void {",
        "    void message;",
        "    void this.tag;",
        "  }",
        "}",
        "",
      ].join("\n"),
    },
    {
      relativePath: "Database.ts",
      contents: [
        "export class Database {",
        "  private readonly tag = 'database';",
        "  query(sql: string): unknown[] {",
        "    void sql;",
        "    void this.tag;",
        "    return [];",
        "  }",
        "}",
        "",
      ].join("\n"),
    },
    {
      relativePath: "UseCase.ts",
      contents: [
        "import type { Database } from './Database';",
        "import type { Logger } from './Logger';",
        "",
        "export class UseCase {",
        "  private readonly tag = 'use-case';",
        "  constructor(",
        "    public readonly logger: Logger,",
        "    public readonly database: Database,",
        "  ) {",
        "    void this.tag;",
        "  }",
        "  run(): void {",
        "    this.logger.log('running');",
        "    void this.database;",
        "  }",
        "}",
        "",
      ].join("\n"),
    },
    {
      relativePath: "input.di.ts",
      contents: [
        "import { defineContext, bean } from 'clean-di';",
        "",
        "import { Logger } from './Logger';",
        "import { UseCase } from './UseCase';",
        "",
        "// `UseCase` needs both Logger and Database but only `logger` is",
        "// in scope. Codegen must fire CDI-001 (UnresolvableDependency).",
        "export const ctx = defineContext()({",
        "  beans: {",
        "    logger: bean(Logger),",
        "    useCase: bean(UseCase),",
        "  },",
        "  expose: ['useCase'] as const,",
        "});",
        "",
      ].join("\n"),
    },
  ],
};

async function writePackageJson(root: string): Promise<void> {
  // Intentionally NOT `"type": "module"` — the fixtures use bare relative
  // imports (no .js extensions), which TS's NodeNext resolution rejects under
  // ESM. The existing CLI e2e tests use the same shape.
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "clean-di-plugin-itest",
        cleanDi: {
          include: ["**/*.di.ts"],
          exclude: ["**/node_modules/**"],
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function writeTsconfig(root: string): Promise<void> {
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: false,
          skipLibCheck: true,
          baseUrl: ".",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

/**
 * Install a stubbed `clean-di` package inside `<root>/node_modules/clean-di`.
 *
 * `parseDiFile` matches `defineContext`, `bean`, `provide`, `defineConfig` by
 * symbol identity, which requires each function to live in its own source
 * file (so the TS Program creates distinct symbols). This mirrors
 * `test/util/loadFixture.ts`'s stub layout exactly.
 */
async function stubCleanDi(root: string): Promise<void> {
  const stubDir = join(root, "node_modules", "clean-di", "src", "public");
  await mkdir(stubDir, { recursive: true });

  await writeFile(
    join(stubDir, "defineContext.ts"),
    "export function defineContext<TConfig = void>(): (spec: any) => any { return () => undefined as any; }",
  );
  await writeFile(
    join(stubDir, "defineConfig.ts"),
    "export function defineConfig<T>(spec: T): T { return spec; }",
  );
  await writeFile(
    join(stubDir, "bean.ts"),
    "export function bean<C extends new (...args: any[]) => any>(Class: C, overrides?: any): InstanceType<C> { return undefined as any; }",
  );
  await writeFile(
    join(stubDir, "provide.ts"),
    "export function provide<T>(factory: (cfg: any) => T): T { return undefined as any; }",
  );
  await writeFile(
    join(stubDir, "index.ts"),
    [
      "export { defineContext } from './defineContext';",
      "export { defineConfig } from './defineConfig';",
      "export { bean } from './bean';",
      "export { provide } from './provide';",
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
}
