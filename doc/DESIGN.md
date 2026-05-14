# clean-di — Design Document

> **Status:** Working draft, v0.1
> **Working name:** `clean-di` (provisional — easy to rename before first publish)
> **License:** MIT (intended)
> **Type:** Stand-alone TypeScript dependency-injection library

---

## 0. Summary

`clean-di` is a TypeScript dependency-injection library designed around a single deliberate principle: **the DI library must leave no trace in domain code**. No decorators on domain or config classes, no `static $inject` arrays, no marker interfaces, no runtime reflection.

Auto-wiring is achieved by **build-time codegen**, not by a TypeScript transformer. A small CLI (`clean-di-codegen`) reads each `.di.ts` source file, resolves constructor signatures using the TypeScript compiler API, and emits a committed `.di.generated.ts` file alongside it. That generated file is what the runtime consumes.

The design draws inspiration from Spring's `@Configuration` / `@Bean` model, but without annotations. The configuration surface is a single function call (`defineContext`) per context.

---

## 1. Problem statement

Existing TypeScript DI libraries force a trade-off:

- **Decorator-based libraries** (InversifyJS, tsyringe, TypeDI, typescript-ioc) couple domain classes to the DI library via `@Injectable` / `@Inject` annotations. This violates the clean-architecture rule that inner layers must not depend on outer infrastructure.
- **Decorator-free libraries** (Brandi, Awilix CLASSIC, Pumpit) either sacrifice auto-wiring (Brandi — every binding is hand-written) or push a small but real DI footprint into domain code (Awilix CLASSIC requires `static inject = [...]` arrays).
- **Transformer-based libraries** (Clawject, `@wessberg/DI-compiler`) deliver Spring-bean ergonomics but couple the build pipeline to `ts-patch` or a custom compiler hook, with non-trivial operational risk on every TypeScript upgrade.
- **Hand-rolled factory functions** (the status quo in many codebases) scale poorly: large factories balloon to 1000+ lines, become single-file merge-conflict hotspots, declare each bean in 2–3 places, and force manual constructor wiring by parameter position.

There is no off-the-shelf library that simultaneously satisfies:

1. Zero DI-library references in domain code
2. Zero decorators anywhere (including config classes)
3. Type-driven auto-wiring
4. Modular composition (multiple sub-configs aggregated into a parent context)
5. No runtime reflection
6. No TypeScript transformer / compiler patching

`clean-di` is designed to be that library.

---

## 2. Goals and non-goals

### 2.1 Goals

1. **Zero DI footprint in domain classes.** No imports from `clean-di` in `application/`, `api/`, `repository/`, `presentation/`, or `ui/` layers. No decorators, no static fields, no marker interfaces.
2. **Zero decorators anywhere.** Including the config classes. The entire DSL is plain function calls.
3. **Type-driven auto-wiring.** Constructor parameters are resolved by structural type matching against the bean bag in scope, with parameter-name fallback when types are ambiguous.
4. **Modular composition.** Beans can be grouped into reusable `defineConfig` modules and imported into one or more parent contexts via `imports: [...]`.
5. **Lifecycle hooks.** `postConstruct(beans, config)` and `preDestroy(beans, config)`.
6. **Scoped containers.** Per-key caching with deterministic identity (per-tenant, per-route, per-test).
7. **Type-safe public surface.** `expose: [...]` whitelist, compile-time-checked against `keyof Beans`.
8. **Build-time errors.** Unresolvable, ambiguous, or cyclic wiring → diagnostic at the failing source location, never a runtime surprise.
9. **Framework-agnostic core.** React/Vue/Angular/Node adapters are separate packages, not core.
10. **Bundler-agnostic.** Works with any pipeline that runs TypeScript: webpack, rollup, vite, esbuild, tsc.
11. **Tiny runtime.** Sub-300 lines, no runtime dependencies.
12. **Committed generated code.** `.di.generated.ts` files are human-readable, debuggable, and reviewed in PRs alongside their `.di.ts` sources.

### 2.2 Non-goals

- **Runtime reflection / `reflect-metadata`.** Rejected on architectural grounds.
- **Decorator-based API.** Rejected on the same grounds.
- **Transformer / `ts-patch` integration.** Rejected for operational reasons.
- **Auto-discovery / classpath scanning.** All beans are explicit in `.di.ts` files.
- **AOP, interceptors, profiles.** Out of scope for v1.
- **Distributed / multi-process containers.** Out of scope.
- **Hot-swapping bean implementations at runtime.** Out of scope.

---

## 3. Design principles

1. **Codegen, not transformer.** A standalone CLI emits committed `.di.generated.ts` files. No `ts-patch`. No compiler plugins. The TypeScript compiler runs unmodified.
2. **Author writes the surface; codegen fills the wiring.** `.di.ts` declares _what exists_. The generator decides _how it gets constructed_.
3. **Domain code is sacred.** A class participating in DI looks identical to a class that doesn't.
4. **Config code is functional.** No `@Configuration` decorator. The configuration is a plain `defineContext({...})` call.
5. **Explicit registration.** No auto-scanning. Every bean appears in some `.di.ts` file.
6. **Composition over magic.** `imports: [subConfigA, subConfigB]` — plain references.
7. **Fail loud at build time.** Unresolvable / ambiguous / cyclic wiring is a CLI error pointing at the failing source.
8. **No proxies, no reflection at runtime.** The generated file is plain TypeScript.

---

## 4. High-level architecture

### 4.1 Packages

| Package            | Purpose                                                 | Production dep?    |
| ------------------ | ------------------------------------------------------- | ------------------ |
| `clean-di`         | Runtime: `createContext`, `Container`, public DSL types | Yes                |
| `clean-di-codegen` | CLI that reads `.di.ts` and emits `.di.generated.ts`    | No (devDependency) |
| `clean-di-react`   | React provider + hooks (post-v1)                        | Optional           |

### 4.2 Pipeline

```
.di.ts (author hand-writes)
    │
    │  clean-di-codegen (CLI; tsc-API based)
    ▼
.di.generated.ts (committed; reviewed in PRs)
    │
    │  your TypeScript build (tsc / webpack / vite / esbuild)
    ▼
Production bundle
```

The runtime API consumed at runtime lives in `clean-di/runtime` (a secondary entry). The author-facing surface (`defineContext`, `bean`, `provide`, …) lives in `clean-di`'s default entry — these are types-mostly with zero runtime behavior.

### 4.3 What the codegen does

For each `.di.ts` file:

1. Parse with TypeScript compiler API.
2. Identify `defineContext` / `defineConfig` calls.
3. Build the **bean scope** (local beans + transitively imported beans + config-derived beans).
4. For each `bean(SomeClass)` call site, resolve `SomeClass`'s constructor signature, match each parameter to a bean in scope (by type, with parameter-name fallback).
5. Topologically sort the resolved bean graph; detect cycles.
6. Emit `.di.generated.ts` with explicit `new` calls in topo order.

---

## 5. The DSL (author surface)

### 5.1 `defineContext`

Top-level construct. Returns a `Container<Config, Exposed>` factory.

```ts
import { defineContext, bean, provide } from "clean-di";

import { Logger } from "./Logger";
import { HttpPostsRepository } from "./HttpPostsRepository";
import { ListPostsUseCase } from "./ListPostsUseCase";

export interface PostsContextConfig {
  readonly apiBaseUrl: string;
  readonly authToken: string;
}

export const postsContext = defineContext<PostsContextConfig>()({
  beans: {
    apiBaseUrl: provide((cfg) => cfg.apiBaseUrl),
    authToken: provide((cfg) => cfg.authToken),
    logger: provide(() => new Logger("posts")),

    postsRepository: bean(HttpPostsRepository),
    listPosts: bean(ListPostsUseCase),
  },
  expose: ["listPosts"] as const,
});
```

**Type signature**:

```ts
function defineContext<TConfig = void>(): <TBeans extends Beans>(
  spec: ContextSpec<TConfig, TBeans>,
) => Container<TConfig, ExposedOf<TBeans, spec["expose"]>>;
```

The curried form is necessary so the user can pin `TConfig` explicitly while letting `TBeans` infer.

### 5.2 `defineConfig`

Same shape minus `expose`. Produces a reusable bean module.

```ts
import { defineConfig, bean } from "clean-di";

export const commentsConfig = defineConfig({
  beans: {
    commentsRepository: bean(HttpCommentsRepository),
    listComments: bean(ListCommentsUseCase),
    deleteComment: bean(DeleteCommentUseCase),
  },
});
```

A `defineConfig` module has no public surface — it's transparent to its importers. Every bean it declares is visible in the parent context's scope.

### 5.3 `provide`

An explicit factory binding. Use for:

- Reading values from the config object
- Wrapping third-party instances
- Conditional construction
- Anything the codegen cannot infer from a constructor signature

```ts
provide<string>((cfg) => cfg.apiBaseUrl);
provide(() => new ApolloClient({ uri: "https://..." }));
provide(() => globalEventBus);
```

**Type signature**: `provide<T>(factory: (config: TConfig) => T): BeanDef<T>`.

### 5.4 `bean`

The codegen marker. At author time it's a typed placeholder that returns `InstanceType<C>`. At codegen time it's replaced with an explicit `new C(...)` call with resolved positional arguments.

```ts
bean(SomeClass); // pure auto-wire
bean(SomeClass, { paramName: "overriddenBeanName" }); // qualifier override
```

**Type signature**:

```ts
function bean<C extends new (...args: any[]) => any>(
  Class: C,
  overrides?: Partial<Record<string, string>>,
): BeanDef<InstanceType<C>>;
```

The `overrides` map is the escape hatch when type-based resolution is ambiguous (multiple beans of the same type in scope). Keys are constructor parameter names; values are bean names from the local scope.

### 5.5 `imports`

Pulls bean definitions from one or more `defineConfig` modules.

```ts
defineContext<Config>()({
  imports: [commentsConfig, usersConfig],
  beans: {
    /* can reference any bean from commentsConfig / usersConfig */
  },
  expose: ["listPosts", "listComments", "getCurrentUser"] as const,
});
```

Diamond imports (same config imported through multiple paths) are deduplicated by reference identity. The same `defineConfig` instance referenced twice is treated as one set of beans.

### 5.6 Lifecycle hooks

```ts
defineContext<Config>()({
  beans: {
    /* ... */
  },
  postConstruct: ({ logger, listPosts }, cfg) => {
    logger.info(`PostsContext ready (apiBaseUrl=${cfg.apiBaseUrl})`);
  },
  preDestroy: ({ logger }) => {
    logger.info("PostsContext destroyed");
  },
});
```

Execution order:

- `postConstruct`: imported configs first (in `imports` order), then the parent context.
- `preDestroy`: parent context first, then imports in reverse order (LIFO).

Errors thrown from `postConstruct` propagate out of `container.get(...)` and the partially-built instance is destroyed. Errors from `preDestroy` are collected into an `AggregateError` and surfaced but do not prevent the rest of the teardown.

### 5.7 `expose`

A const-array whitelist of bean names that are part of the public surface.

```ts
expose: ["listPosts", "createPost", "logger"] as const;
```

Beans not in `expose` are private — used internally for wiring but invisible to consumers. The exposed type is computed as `Pick<Beans, ExposedKeys>` and surfaces as the `Container`'s second generic.

---

## 6. Runtime (`clean-di`)

### 6.1 Container interface

```ts
export interface Container<TConfig, TExposed> {
  get(
    options: TConfig extends void ? { key?: unknown } : { config: TConfig; key?: unknown },
  ): TExposed;
  destroy(key?: unknown): void;
  destroyAll(): void;
}
```

Semantics:

- `get(...)` is idempotent per `key`. Same key → same returned `TExposed` (referentially equal).
- `destroy(key)` runs `preDestroy` hooks and evicts the cache entry.
- `destroyAll()` destroys every cached instance.

### 6.2 `createContext` (the runtime entry the generated file uses)

```ts
export function createContext<TConfig, TExposed>(
  builder: (config: TConfig) => BuildResult<TExposed>,
): Container<TConfig, TExposed>;

interface BuildResult<TExposed> {
  readonly bag: Record<string, unknown>;
  readonly postConstruct?: (config: unknown) => void;
  readonly preDestroy?: (config: unknown) => void;
  readonly expose: TExposed;
}
```

The generated file constructs the bag, runs `postConstruct`, and returns the trio. The runtime wraps that into a `Container` with caching/destroy behavior.

### 6.3 Scoping & caching

A `Container` keeps a `Map<unknown, CachedInstance>` keyed by `key`. Identity comparison. Common patterns:

- **Singleton per app**: omit `key`.
- **Per-tenant**: `key: tenantId`.
- **Per-test**: `key: testName`, destroyed in `afterEach`.

No automatic scope inference. The caller chooses.

### 6.4 Public API surface

The full author-facing API:

```ts
// clean-di
export { defineContext, defineConfig, provide, bean };
export type { Container, BeanDef, ContextSpec, ConfigSpec };

// clean-di/runtime  (used by generated files only)
export { createContext };
export type { BuildResult };
```

Maximum 9 named exports.

---

## 7. Codegen (`clean-di-codegen`)

### 7.1 CLI

```
clean-di-codegen                 # one-shot full scan
clean-di-codegen --watch         # watch mode
clean-di-codegen --check         # verify generated files are up to date (CI)
clean-di-codegen --config <path> # explicit config file
```

### 7.2 Configuration

```ts
// clean-di.config.ts (repo root)
export default {
  include: ["src/**/*.di.ts"],
  exclude: ["**/node_modules/**", "**/*.test.ts"],
  tsconfig: "./tsconfig.json",
  output: "adjacent", // .di.generated.ts beside .di.ts
  header: "AUTO-GENERATED…", // custom file header
};
```

Alternative: `cleanDi` key in `package.json`.

### 7.3 Wiring algorithm

For each `.di.ts` file:

1. **Parse** with TS compiler API. Locate `defineContext` and `defineConfig` calls.
2. **Build bean scope** for each call:
   - Local beans = entries in the `beans` field.
   - Imported beans = transitive union via `imports`, walking each imported `defineConfig` symbol.
   - Config beans = synthetic beans of type `cfg.<field>` for each field of `TConfig`, addressable by name only via `provide`.
3. **Resolve each `bean(Class)` entry**:
   1. Get `Class`'s constructor signature via type checker.
   2. For each parameter:
      a. If the override map specifies this param → use the named bean.
      b. Find scope beans whose declared type is structurally assignable to the parameter type via `checker.isTypeAssignableTo`.
      c. **One match by type** → use it.
      d. **Zero matches by type** → fall back to name match (parameter name vs bean key). Type still must be assignable.
      e. **Multiple matches by type** → fall back to name match within the candidates. If unambiguous, use; otherwise emit `CDI-002 AmbiguousDependency`.
      f. **No resolution** → emit `CDI-001 UnresolvableDependency`.
4. **Topological sort**: build a DAG (bean → its dependencies). Detect cycles. If cyclic → emit `CDI-003 CyclicDependency` with the cycle path.
5. **Emit `.di.generated.ts`** in topo order.

### 7.4 Type matching rules

- Uses `checker.isTypeAssignableTo(beanType, paramType)`.
- Generic arguments must match: `Repository<Post>` does **not** match `Repository<Comment>`.
- Subtypes match supertypes: a bean of type `T` satisfies a `T | U` parameter.
- Optional parameters (`param?: T` or `param: T = default`): if unresolvable, omit (call uses default).
- `never` and `any` parameters: ambiguity error (refuses to silently match all).

### 7.5 Name fallback rules

- Parameter name is compared **verbatim** to bean keys.
- Case-sensitive.
- No fuzzy / camelCase / kebab-case normalization (typos fail loudly).
- Documented as the disambiguation policy in the README.

### 7.6 Cycle handling

Hard error in v1. Diagnostic includes the cycle path:

```
CDI-003 CyclicDependency at src/blog/posts/PostsContext.di.ts:14
  Cycle: postsRepository → listPosts → postsRepository
  Hint: refactor to break the cycle, or move shared state to a third bean.
```

Lazy bean breaking (`bean.lazy(Class)` → emits a getter that defers resolution) is on the post-v1 roadmap.

### 7.7 Diagnostic reporting

Diagnostics are emitted in standard TypeScript diagnostic format so editors and CI pipelines can surface them. Each diagnostic carries:

- File path and line/column
- Error code (`CDI-001`…`CDI-099`)
- Human-readable message
- Suggested fix where applicable

In watch mode, errors are logged and the watcher continues.
In one-shot mode, exit code is 1 if any error fires.
In `--check` mode, exit code is 1 if any generated file is missing or stale.

### 7.8 Generated file format

```ts
// AUTO-GENERATED by clean-di-codegen — DO NOT EDIT.
// Source: src/blog/posts/PostsContext.di.ts
// Generator: clean-di-codegen 1.0.0
// Hash: sha256:a3f8c9…

import { Logger } from "./Logger";
import { HttpPostsRepository } from "./HttpPostsRepository";
import { ListPostsUseCase } from "./ListPostsUseCase";
import { createContext } from "clean-di/runtime";

import type { PostsContextConfig } from "./PostsContext.di";

export const postsContext = createContext<PostsContextConfig, { listPosts: ListPostsUseCase }>(
  (cfg) => {
    const apiBaseUrl = cfg.apiBaseUrl;
    const authToken = cfg.authToken;
    const logger = new Logger("posts");
    const postsRepository = new HttpPostsRepository(apiBaseUrl, authToken, logger);
    const listPosts = new ListPostsUseCase(postsRepository);

    return {
      bag: { apiBaseUrl, authToken, logger, postsRepository, listPosts },
      expose: { listPosts },
    };
  },
);
```

### 7.9 Hash-based skip and `--check`

Generated files include a hash of:

- The source `.di.ts` content
- Resolved constructor signatures (so a change in a class's constructor invalidates downstream contexts)
- Generator version

In `--check` mode, the codegen rebuilds in memory and compares against the committed file. Any mismatch → exit 1. CI runs `clean-di-codegen --check` to catch forgotten regenerations.

---

## 8. Error model

### 8.1 Codegen diagnostics

| Code      | Name                   | Trigger                                                         | Suggested fix                                              |
| --------- | ---------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `CDI-001` | UnresolvableDependency | No bean in scope matches a constructor parameter                | Add the dep as `bean(...)`/`provide(...)` or via `imports` |
| `CDI-002` | AmbiguousDependency    | Multiple type matches, no name match                            | Add `{ paramName: 'beanName' }` override                   |
| `CDI-003` | CyclicDependency       | Bean construction cycle                                         | Refactor to break the cycle                                |
| `CDI-004` | MissingExposeTarget    | Name in `expose` doesn't exist in `beans`/`imports`             | Add the bean or fix the name                               |
| `CDI-005` | InvalidContextShape    | `defineContext` malformed (e.g., missing generic)               | Provide the config generic                                 |
| `CDI-006` | DuplicateBean          | Same name in local `beans` and an imported config               | Rename one                                                 |
| `CDI-007` | InvalidBeanDef         | RHS of a bean entry is neither `bean(...)` nor `provide(...)`   | Use one of the two primitives                              |
| `CDI-008` | UnsupportedConstructor | Class uses spread/destructure constructor (not supported in v1) | Use `provide(() => new X(...))`                            |
| `CDI-009` | ConfigTypeNotFound     | `defineContext<Config>` references an unresolved type           | Import the type                                            |
| `CDI-010` | InvalidImport          | `imports` entry is not a `defineConfig` result                  | Use a `defineConfig(...)` value                            |

### 8.2 Runtime errors

| Code       | Trigger                                                                                 |
| ---------- | --------------------------------------------------------------------------------------- |
| `CDIE-101` | `get()` called after `destroy()` for the same key                                       |
| `CDIE-102` | `destroy()` called for an unknown key (warning, not throw)                              |
| `CDIE-103` | `postConstruct` threw — partial instance is destroyed, original error rethrown          |
| `CDIE-104` | `preDestroy` threw — collected into `AggregateError`, surfaced after teardown completes |

---

## 9. Packaging and distribution

### 9.1 Monorepo layout

```
clean-di/
  packages/
    clean-di/
      src/
        public/
          defineContext.ts
          defineConfig.ts
          provide.ts
          bean.ts
          types.ts
        runtime/
          createContext.ts
          Container.ts
          buildResult.ts
        index.ts             # re-exports public/*
        runtime.ts           # re-exports runtime/* (secondary entry)
      test/
      package.json
      tsconfig.json
    clean-di-codegen/
      src/
        cli/
          main.ts
          watch.ts
          check.ts
          args.ts
        analyzer/
          parseDiFile.ts
          collectContexts.ts
          buildBeanScope.ts
          resolveConstructor.ts
          resolveOneParam.ts
          topoSort.ts
        emitter/
          emitGeneratedFile.ts
          formatGenerated.ts
          hash.ts
        diagnostics/
          codes.ts
          formatDiagnostic.ts
          report.ts
        config/
          loadConfig.ts
          defaultConfig.ts
        index.ts
        bin.ts                # CLI entrypoint
      test/
        fixtures/
          unambiguous/
          ambiguous/
          cycle/
          imports/
          lifecycle/
        analyzer.test.ts
        emitter.test.ts
        e2e.test.ts
      package.json
      tsconfig.json
  examples/
    basic/
    modular/
    full-blog-app/
  doc/
    DESIGN.md          (this file)
    README.md
    GETTING_STARTED.md
    MIGRATION.md
  .github/
    workflows/
      ci.yml
  package.json         # workspaces root
  pnpm-workspace.yaml  # or yarn workspaces
  tsconfig.base.json
  README.md            # repo-level
  LICENSE              # MIT
  .gitignore
  .editorconfig
  .prettierrc
  .eslintrc.cjs
```

### 9.2 Versioning

Semantic versioning.

- **Major bumps** require regenerating all `.di.generated.ts` files; the generator emits a different format.
- **Minor bumps** are output-compatible; existing generated files continue to work.
- **Patch bumps** are bugfix-only; no observable output changes.

Generated files include `Generator: clean-di-codegen X.Y.Z` so version mismatches are detectable.

### 9.3 Dependencies

- `clean-di` runtime: **zero** runtime dependencies.
- `clean-di-codegen`:
  - `typescript` (peer, `>= 5.0`)
  - `chokidar` (watch mode)
  - `picocolors` (terminal output)
  - `commander` or `mri` (arg parsing)

### 9.4 License

MIT.

---

## 10. Testing strategy

### 10.1 Runtime

- Pure unit tests for `createContext`, scoping/caching, lifecycle ordering, destroy semantics, imports composition.
- Target: 100% line coverage. The surface is small.

### 10.2 Codegen

- **Fixture-based**: each fixture is a folder under `test/fixtures/<scenario>/` containing:
  - `input.di.ts` — the source
  - `expected.di.generated.ts` — the expected emitted file
  - (optional) `expected-diagnostics.json` — for negative fixtures
- **Snapshot tests** for the emitter format.
- **Negative fixtures** for each `CDI-*` code (input + expected diagnostic).
- **End-to-end**: a few real-world contexts compile, emit, and successfully `tsc`-compile + run.

### 10.3 Integration

- A sample app in `examples/full-blog-app` builds and runs in CI.
- Generated files in examples are committed; `clean-di-codegen --check` runs in CI.

### 10.4 Test runner

- Vitest (fast, ESM-native, no Jest baggage).

---

## 11. Roadmap (tracer-bullet sequence)

### v0.1 — runtime tracer (Week 1)

- `createContext`, `Container`, scoping, no `bean()` yet (only `provide`).
- Hand-written generated file proves the runtime end-to-end.

### v0.2 — codegen MVP (Week 2–3)

- `bean(Class)` for unambiguous cases.
- Single context, no imports.
- Hash-based skip.
- Snapshot tests on fixtures.

### v0.3 — qualifier overrides + name fallback (Week 4)

- `bean(Class, { overrides })`.
- Name-fallback resolution.
- Diagnostics `CDI-001`, `CDI-002`.

### v0.4 — modular composition (Week 5)

- `defineConfig` + `imports`.
- Transitive bean scope.
- Diamond import dedup.
- Diagnostic `CDI-006`.

### v0.5 — lifecycle (Week 6)

- `postConstruct`, `preDestroy`.
- Runtime errors `CDIE-103`, `CDIE-104`.

### v0.6 — diagnostics polish (Week 7)

- All `CDI-*` codes complete.
- Error-message quality pass.

### v0.7 — CLI + watch + check (Week 8)

- `--watch`, `--check`.
- Editor-friendly output.

### v0.8 — examples & docs (Week 9)

- README, GETTING_STARTED, MIGRATION guides.
- Three working examples.

### v1.0 — stabilization (Week 10)

- All v0.x landed.
- API frozen.
- Published to npm.

### Post-v1

- `bean.lazy(Class)` for cycle breaking.
- `bean.transient(Class)` for prototype scope.
- `clean-di-react` package.
- LSP server for in-editor diagnostics without rebuild.

---

## 12. Open questions

| #   | Question                                                               | Provisional answer                                                  |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Q1  | `imports` as array or named map?                                       | Array for v1 (`[a, b, c]`). Named map deferred.                     |
| Q2  | Support `.di.tsx` (config files with JSX)?                             | No — config files are logic-only.                                   |
| Q3  | Auto-wire constructors of 3rd-party classes from `node_modules`?       | Yes — codegen only needs `.d.ts`.                                   |
| Q4  | `expose` with renaming (`{ public: 'internal' }`)?                     | Defer to v1.1.                                                      |
| Q5  | Should examples commit generated files or rely on CI to generate them? | Commit + run `--check` in CI.                                       |
| Q6  | TypeScript version floor?                                              | 5.0 (modern decorators settled, type-checker stable).               |
| Q7  | What about `private` / `protected` constructors?                       | Refuse with `CDI-008` — use `provide(() => Class.create(...))`.     |
| Q8  | Mutation of `cfg` inside `provide`?                                    | Not supported. `cfg` is read-only; mutation has undefined behavior. |

---

## Appendix A — Worked example: modular blog app

```ts
// src/blog/comments/CommentsConfig.di.ts
import { defineConfig, bean } from "clean-di";

import { HttpCommentsRepository } from "./HttpCommentsRepository";
import { ListCommentsUseCase } from "./ListCommentsUseCase";
import { DeleteCommentUseCase } from "./DeleteCommentUseCase";

export const commentsConfig = defineConfig({
  beans: {
    commentsRepository: bean(HttpCommentsRepository),
    listComments: bean(ListCommentsUseCase),
    deleteComment: bean(DeleteCommentUseCase),
  },
});
```

```ts
// src/blog/users/UsersConfig.di.ts
import { defineConfig, bean } from "clean-di";

import { HttpUsersRepository } from "./HttpUsersRepository";
import { GetCurrentUserUseCase } from "./GetCurrentUserUseCase";

export const usersConfig = defineConfig({
  beans: {
    usersRepository: bean(HttpUsersRepository),
    getCurrentUser: bean(GetCurrentUserUseCase),
  },
});
```

```ts
// src/blog/BlogContext.di.ts
import { defineContext, bean, provide } from "clean-di";

import { Logger } from "../shared/Logger";
import { HttpPostsRepository } from "./posts/HttpPostsRepository";
import { ListPostsUseCase } from "./posts/ListPostsUseCase";
import { CreatePostUseCase } from "./posts/CreatePostUseCase";
import { commentsConfig } from "./comments/CommentsConfig.di";
import { usersConfig } from "./users/UsersConfig.di";

export interface BlogConfig {
  readonly apiBaseUrl: string;
  readonly authToken: string;
}

export const blogContext = defineContext<BlogConfig>()({
  imports: [commentsConfig, usersConfig],
  beans: {
    apiBaseUrl: provide((cfg) => cfg.apiBaseUrl),
    authToken: provide((cfg) => cfg.authToken),
    logger: provide(() => new Logger("blog")),

    postsRepository: bean(HttpPostsRepository),
    listPosts: bean(ListPostsUseCase),
    createPost: bean(CreatePostUseCase),
  },
  postConstruct: ({ logger }, cfg) => logger.info(`blog ready ${cfg.apiBaseUrl}`),
  preDestroy: ({ logger }) => logger.info("blog destroyed"),
  expose: ["listPosts", "createPost", "listComments", "deleteComment", "getCurrentUser"] as const,
});
```

Consumer:

```ts
const blog = blogContext.get({
  config: { apiBaseUrl: "https://api.example.com", authToken: "xxx" },
});
const posts = await blog.listPosts.execute();
const me = await blog.getCurrentUser.execute();
```

Domain classes — note the total absence of DI library awareness:

```ts
// src/blog/posts/ListPostsUseCase.ts
export class ListPostsUseCase {
  constructor(private readonly repo: HttpPostsRepository) {}

  async execute(): Promise<Post[]> {
    return this.repo.list();
  }
}
```

```ts
// src/blog/posts/HttpPostsRepository.ts
export class HttpPostsRepository {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly authToken: string,
    private readonly logger: Logger,
  ) {}

  async list(): Promise<Post[]> {
    this.logger.info("listing posts");
    const response = await fetch(`${this.apiBaseUrl}/posts`, {
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
    return response.json();
  }
}
```

---

## Appendix B — Prior art comparison

| Library                 | Decorator-free in domain?  | Auto-wire?           | Modular composition? | Codegen vs runtime     | Maturity          |
| ----------------------- | -------------------------- | -------------------- | -------------------- | ---------------------- | ----------------- |
| InversifyJS             | ✗                          | ✓                    | Child containers     | Runtime + decorators   | Mature            |
| tsyringe                | ✗                          | ✓                    | Child containers     | Runtime + decorators   | Mature            |
| TypeDI                  | ✗                          | ✓                    | Service scopes       | Runtime + decorators   | Mature            |
| Brandi                  | ✓                          | ✗ (manual factories) | `Container.extend`   | Runtime                | Stable            |
| Awilix CLASSIC          | ~ (`static inject` arrays) | ✓                    | Scopes               | Runtime                | Mature            |
| Awilix PROXY            | ✓                          | ✓ (by param name)    | Scopes               | Runtime                | Mature            |
| Pumpit                  | ~ (`static inject`)        | ✓                    | Child containers     | Runtime                | Niche             |
| Clawject                | ✓                          | ✓                    | `@Import`            | Transformer (ts-patch) | Active            |
| `@wessberg/DI-compiler` | ✓                          | ✓                    | Limited              | Transformer (ts-patch) | Single maintainer |
| **`clean-di`**          | **✓**                      | **✓**                | **`imports: [...]`** | **Codegen (CLI)**      | **New**           |

The fundamental differentiator is **codegen, not transformer** and **zero decorators anywhere**. `clean-di` is the only TS DI library that simultaneously:

- Has no decorators (domain or config)
- Has no `static $inject` arrays on domain classes
- Has no runtime reflection
- Uses true type-based auto-wiring
- Produces readable, committed generated code

---

## Appendix C — Glossary

| Term               | Definition                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Bean**           | A named, lazily-constructed value in a context's bean bag.                                                     |
| **Bean bag**       | The `Record<string, unknown>` of all beans available within a single `defineContext` after imports are merged. |
| **Bean def**       | The author's declaration of a bean: `bean(Class)`, `bean(Class, overrides)`, or `provide(factory)`.            |
| **Bean scope**     | The set of beans visible during dependency resolution for a particular `bean(Class)` call site.                |
| **Codegen**        | The build-time process that reads `.di.ts` and emits `.di.generated.ts`.                                       |
| **Config**         | The per-instance configuration object passed to `Container.get({ config })`.                                   |
| **Container**      | The runtime object returned by `defineContext`. Caches and destroys instances by key.                          |
| **Context**        | The result of `defineContext` — a typed `Container` factory.                                                   |
| **Defined config** | A `defineConfig({...})` instance — a reusable, importable bean module.                                         |
| **Expose**         | The whitelist of bean names that form the public surface of a context.                                         |
| **Generated file** | The `.di.generated.ts` output of the codegen, committed alongside its `.di.ts` source.                         |
| **Key**            | The cache key passed to `Container.get({ key })` for per-instance scoping.                                     |
| **Override map**   | The `{ paramName: 'beanName' }` argument to `bean(...)` for explicit qualifier-style disambiguation.           |
| **postConstruct**  | Lifecycle hook executed after all beans are built.                                                             |
| **preDestroy**     | Lifecycle hook executed during `Container.destroy(...)`.                                                       |
| **Tracer bullet**  | A minimal end-to-end implementation that proves an architectural slice before deepening.                       |

---

_End of document._
