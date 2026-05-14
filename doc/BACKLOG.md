# clean-di — Implementation Backlog

> **Status:** Working backlog, v0.1
> **Source of truth for design:** [`./DESIGN.md`](./DESIGN.md)
> **Total tasks:** 78
> **Total estimated effort:** ~610h (~15-16 engineer-weeks single-threaded, ~10 calendar weeks with parallelism)

---

## Table of contents

- [Project overview](#project-overview)
- [Wave summary](#wave-summary)
- [Parallelization rationale](#parallelization-rationale)
- [Dependency graph](#dependency-graph)
- [W1 — Foundation (monorepo + tooling)](#w1--foundation-monorepo--tooling)
- [W2 — Runtime core + public DSL](#w2--runtime-core--public-dsl)
- [W3 — Codegen MVP (unambiguous, no imports)](#w3--codegen-mvp-unambiguous-no-imports)
- [W4 — Codegen full (overrides, imports, lifecycle, all diagnostics)](#w4--codegen-full-overrides-imports-lifecycle-all-diagnostics)
- [W5 — CLI (watch, check, args, config)](#w5--cli-watch-check-args-config)
- [W6 — Examples + documentation](#w6--examples--documentation)
- [W7 — Release prep](#w7--release-prep)

---

## Project overview

`clean-di` is a TypeScript dependency-injection library whose single design rule is **leave no trace in domain code**: no decorators, no `static $inject` arrays, no marker interfaces, no runtime reflection. Auto-wiring is achieved at build time by a standalone CLI (`clean-di-codegen`) that reads `.di.ts` source files, resolves constructor signatures via the TypeScript compiler API, and emits committed `.di.generated.ts` files. The runtime (`clean-di`) is a sub-300-line, zero-dependency module that wraps the generated `createContext` calls into a `Container` with per-key caching, lifecycle hooks (`postConstruct`/`preDestroy`), and a type-safe `expose` whitelist. The repo ships as a pnpm-workspaces monorepo with two publishable packages (`clean-di`, `clean-di-codegen`), three runnable examples (`basic`, `modular`, `full-blog-app`), and Vitest-based fixture tests for every diagnostic code (`CDI-001`..`CDI-010`). See [`DESIGN.md`](./DESIGN.md) for the full specification.

---

## Wave summary

| Wave   | Name                                                      | Tasks | Est. hours | Produces                                                                                                                                                               |
| ------ | --------------------------------------------------------- | ----- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **W1** | Foundation (monorepo + tooling)                           | 16    | ~88h       | pnpm monorepo skeleton, both package skeletons, tsconfig base, lint/format/editor configs, Vitest, CI scaffold, MIT LICENSE                                            |
| **W2** | Runtime core + public DSL                                 | 11    | ~88h       | Working `clean-di` runtime: `createContext`, `Container`, `defineContext`, `defineConfig`, `provide`, `bean`, types, dual entrypoints, 100% covered runtime unit tests |
| **W3** | Codegen MVP (unambiguous, no imports)                     | 12    | ~112h      | `clean-di-codegen` that handles a single-context, unambiguous, no-imports case end-to-end. Emits a committed `.di.generated.ts`. Fixture infrastructure in place       |
| **W4** | Codegen full (overrides, imports, lifecycle, diagnostics) | 13    | ~120h      | Qualifier overrides, name fallback, `defineConfig` imports, diamond dedup, lifecycle wiring, all `CDI-001`..`CDI-010` diagnostics, topo sort, hash invalidation        |
| **W5** | CLI (watch, check, args, config)                          | 9     | ~64h       | `clean-di-codegen` binary with one-shot, `--watch` (chokidar), `--check` (CI), `--config`, config-file loader, picocolors output                                       |
| **W6** | Examples + documentation                                  | 12    | ~92h       | Three runnable examples (`basic`, `modular`, `full-blog-app`), `README.md`, `GETTING_STARTED.md`, `MIGRATION.md`, typedoc-generated API ref                            |
| **W7** | Release prep                                              | 5     | ~46h       | Changesets, npm publish workflow, version-bump policy enforced, final API freeze checklist, v1.0.0 tag                                                                 |

---

## Parallelization rationale

### Why W1 tasks all run in parallel

Every W1 task touches a **different file** at a different path. No two W1 tasks edit, depend on, or import from the same file. There are no shared TypeScript symbols, no shared runtime modules — only sibling configuration files (`package.json`, `tsconfig.base.json`, `.eslintrc.cjs`, `pnpm-workspace.yaml`, `.gitignore`, `.editorconfig`, `.prettierrc`, `LICENSE`, `README.md`, the two package skeletons, the CI workflow, Vitest config, root scripts). The only ordering constraint is that the **root `package.json`** and **`pnpm-workspace.yaml`** should land before someone runs `pnpm install`, but a developer can write all sixteen files in any order before the first install. Treat W1 as a fully parallel batch.

### Why W2 must wait for W1

W2 implements TypeScript source files inside `packages/clean-di/src/`. Without W1 there is no `tsconfig.base.json` to extend, no package `package.json`, no Vitest config, and no lint rules — `pnpm install`, `tsc`, and the test runner cannot operate. Within W2 itself most tasks are parallel-safe: `defineContext.ts`, `defineConfig.ts`, `provide.ts`, `bean.ts`, `types.ts`, `createContext.ts`, `Container.ts`, `buildResult.ts` are all separate files. Only the two entrypoints (`index.ts`, `runtime.ts`) must wait until the files they re-export exist.

### Why W3 must wait for W2

The codegen emits TypeScript that **imports from `clean-di/runtime`** and references the public DSL types from `clean-di`. The runtime API surface (`createContext`, `BuildResult`) must be frozen before the emitter can produce stable output. The analyzer also needs to recognise calls to `defineContext` / `defineConfig` / `bean` / `provide` — those symbol identities are defined in W2. Within W3, the three pillars (analyzer, emitter, diagnostics, config-loader) live in disjoint folders (`src/analyzer/`, `src/emitter/`, `src/diagnostics/`, `src/config/`) and can be developed in parallel after the shared types in `T-038` land.

### Why W4 must wait for W3

W4 extends the analyzer with override resolution, name fallback, imports, lifecycle wiring, and full diagnostic reporting. Every W4 task either edits a file W3 created (`resolveOneParam.ts`, `buildBeanScope.ts`, `emitGeneratedFile.ts`) or adds a sibling file that imports it. The MVP wiring path must exist first or W4 has nothing to extend.

### Why W5 can partially overlap W4

The CLI shell (`args.ts`, `bin.ts`, `main.ts`, watch glue, config loader) reads from the analyzer/emitter pair as an opaque function. As soon as W3 provides a `runOnce(file): Result` function, the CLI can wrap it. The CI-blocking dependency is only that `--check` and `--watch` need the **full** codegen path to be stable — meaning the very last task of W5 (the integration test of `--check` against a fixture with all CDI codes) needs W4 done. Most W5 tasks can start once W3 is green.

### Why W6 must wait for W4 + W5

Examples exercise the full library through the CLI. The `full-blog-app` example contains imports, lifecycle hooks, and exposed beans — all W4 features. The committed `.di.generated.ts` files in each example are produced by the W5 CLI. Docs (`GETTING_STARTED.md`, `MIGRATION.md`) reference real, working code paths that exist only after W4 + W5.

### Why W7 must wait for W6

Release prep finalises the README, runs `--check` against committed example outputs in CI, freezes the public API, and cuts the v1.0.0 tag. None of that is meaningful until W6 demonstrates the library works end-to-end.

---

## Dependency graph

```
                  ┌───────────────────────────┐
                  │  W1 — Foundation (16x∥)   │
                  │  monorepo + tooling       │
                  └────────────┬──────────────┘
                               │
                               ▼
                  ┌───────────────────────────┐
                  │  W2 — Runtime core        │
                  │  (11 tasks, mostly ∥)     │
                  │  createContext/Container  │
                  │  defineContext/Config     │
                  │  provide/bean/types       │
                  └────────────┬──────────────┘
                               │
                               ▼
                  ┌───────────────────────────┐
                  │  W3 — Codegen MVP         │
                  │  (12 tasks)               │
                  │  analyzer / emitter /     │
                  │  diagnostics / config     │
                  │  (unambiguous, no imports)│
                  └────────────┬──────────────┘
                               │
                  ┌────────────┴────────────┐
                  ▼                         ▼
       ┌────────────────────┐    ┌─────────────────────┐
       │  W4 — Codegen full │    │  W5 — CLI           │
       │  (13 tasks)        │◄───┤  (9 tasks)          │
       │  overrides, name   │    │  watch, check,      │
       │  fallback, imports,│    │  args, config       │
       │  lifecycle,        │    │  (may start once    │
       │  CDI-001..010      │    │   W3 stable)        │
       └─────────┬──────────┘    └──────────┬──────────┘
                 │                          │
                 └────────────┬─────────────┘
                              ▼
                  ┌───────────────────────────┐
                  │  W6 — Examples + docs     │
                  │  (12 tasks)               │
                  │  basic / modular /        │
                  │  full-blog-app +          │
                  │  README/GS/MIGRATION/API  │
                  └────────────┬──────────────┘
                               │
                               ▼
                  ┌───────────────────────────┐
                  │  W7 — Release prep        │
                  │  (5 tasks)                │
                  │  changesets, publish,     │
                  │  v1.0.0                   │
                  └───────────────────────────┘
```

---

## W1 — Foundation (monorepo + tooling)

All sixteen tasks below are **parallel-safe with each other** — they touch disjoint files.

### T-001 Initialise pnpm workspace root

- **Wave:** W1
- **Description:** Create the root `package.json` configured for pnpm workspaces. Declare engines (`node >= 20`, `pnpm >= 9`), package name (`clean-di-monorepo`, private: true), shared scripts (`build`, `lint`, `test`, `typecheck`, `format`). No production dependencies at the root.
- **Acceptance criteria:**
  - `pnpm install` at repo root succeeds and creates `node_modules/.pnpm`.
  - `pnpm run -r` enumerates both packages once they exist.
  - `private: true` is set.
  - `packageManager` field pins pnpm version.
- **Files affected:** `package.json`
- **Dependencies:** none
- **Effort:** 4h
- **Parallel-safe with:** all others in W1
- **Notes:** Use pnpm (DESIGN §9.1 calls for "pnpm-workspace.yaml or yarn workspaces" — pnpm is preferred).

### T-002 Add `pnpm-workspace.yaml`

- **Wave:** W1
- **Description:** Declare `packages/*` and `examples/*` as workspaces. Examples are workspaces so they can use `workspace:*` to depend on the local `clean-di` build.
- **Acceptance criteria:**
  - `pnpm list -r` (after `T-001`) shows both `packages/*` and any `examples/*` once those exist.
- **Files affected:** `pnpm-workspace.yaml`
- **Dependencies:** none
- **Effort:** 4h
- **Parallel-safe with:** all others in W1
- **Notes:** Effort buffer covers initial pnpm idiosyncrasies (peer-dep auto-install, hoist patterns).

### T-003 Create `tsconfig.base.json`

- **Wave:** W1
- **Description:** Root TypeScript config that every package extends. Strict mode on, `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `declaration: true`, `declarationMap: true`, `sourceMap: true`, `isolatedModules: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`.
- **Acceptance criteria:**
  - File compiles standalone (`tsc -p tsconfig.base.json --noEmit` passes when there is at least one trivial input).
  - All strictness flags enabled.
- **Files affected:** `tsconfig.base.json`
- **Dependencies:** none
- **Effort:** 4h
- **Parallel-safe with:** all others in W1
- **Notes:** TypeScript >= 5.0 per DESIGN §Open-Q6.

### T-004 Add `.gitignore`

- **Wave:** W1
- **Description:** Ignore `node_modules`, `dist`, `coverage`, `.turbo`, `*.log`, `.DS_Store`, `.vscode/*` (except `settings.json`), `*.tsbuildinfo`.
- **Acceptance criteria:**
  - `git status` after `pnpm install` is clean.
- **Files affected:** `.gitignore`
- **Dependencies:** none
- **Effort:** 4h
- **Parallel-safe with:** all others in W1
- **Notes:** Do **not** ignore `*.di.generated.ts` — those are intentionally committed (DESIGN §2.1.12).

### T-005 Add `.editorconfig`

- **Wave:** W1
- **Description:** Standard `.editorconfig`: UTF-8, LF line endings, 2-space indent for TS/JSON/YAML, trailing newline, trim trailing whitespace.
- **Acceptance criteria:**
  - Editors honor the rules across all file types in the repo.
- **Files affected:** `.editorconfig`
- **Dependencies:** none
- **Effort:** 4h
- **Parallel-safe with:** all others in W1
- **Notes:** None.

### T-006 Add `.prettierrc`

- **Wave:** W1
- **Description:** Configure Prettier (printWidth 100, single-quote false, trailing comma `all`, semi true). Add Prettier as a devDep at the root.
- **Acceptance criteria:**
  - `pnpm prettier --check .` passes on a clean repo.
- **Files affected:** `.prettierrc`, `.prettierignore`
- **Dependencies:** none (root `package.json` will pick up the devDep when T-001 lands)
- **Effort:** 4h
- **Parallel-safe with:** all others in W1
- **Notes:** Ignore `**/*.di.generated.ts` from formatting if `formatGenerated.ts` does its own formatting (decide in T-049).

### T-007 Add `.eslintrc.cjs`

- **Wave:** W1
- **Description:** ESLint with `@typescript-eslint`, `eslint-plugin-import`, `eslint-plugin-unused-imports`. Enforce: no relative parent imports across package boundaries, no `any`, prefer-const, no-floating-promises, consistent-type-imports.
- **Acceptance criteria:**
  - `pnpm eslint .` passes on an empty workspace.
  - Plugin set installed at the root.
- **Files affected:** `.eslintrc.cjs`, `.eslintignore`
- **Dependencies:** none
- **Effort:** 6h
- **Parallel-safe with:** all others in W1
- **Notes:** Ignore `**/*.di.generated.ts` (codegen output, not authored).

### T-008 Add `LICENSE` (MIT)

- **Wave:** W1
- **Description:** Standard MIT LICENSE text with the appropriate copyright year and holder.
- **Acceptance criteria:**
  - SPDX `MIT` license recognised by GitHub.
- **Files affected:** `LICENSE`
- **Dependencies:** none
- **Effort:** 4h
- **Parallel-safe with:** all others in W1
- **Notes:** Copyright holder TBD — default to "clean-di contributors" until otherwise decided.

### T-009 Add root `README.md`

- **Wave:** W1
- **Description:** Minimal landing page for the monorepo: name, one-line pitch, link to `doc/DESIGN.md`, link to package READMEs (post-W6), repository structure, license badge. This README is _repo-level_, not the user-facing docs (those land in W6).
- **Acceptance criteria:**
  - File renders cleanly on GitHub.
  - Pitch is one sentence and matches DESIGN §0.
- **Files affected:** `README.md`
- **Dependencies:** none
- **Effort:** 4h
- **Parallel-safe with:** all others in W1
- **Notes:** Plan a W6 rewrite once examples exist; this is a stub.

### T-010 Add `.github/workflows/ci.yml`

- **Wave:** W1
- **Description:** GitHub Actions CI that on every push and PR runs (in this order): `pnpm install --frozen-lockfile`, `pnpm typecheck -r`, `pnpm lint -r`, `pnpm test -r`, `pnpm build -r`. Matrix on Node 20 + 22. Cache pnpm store.
- **Acceptance criteria:**
  - Workflow file passes `actionlint`.
  - Once W2 lands, the workflow goes green on a clean clone.
- **Files affected:** `.github/workflows/ci.yml`
- **Dependencies:** none
- **Effort:** 6h
- **Parallel-safe with:** all others in W1
- **Notes:** `pnpm clean-di-codegen --check` step is added later in W6 once the CLI exists. Leave a TODO comment.

### T-011 Scaffold `packages/clean-di/package.json`

- **Wave:** W1
- **Description:** Create the runtime package manifest. Fields: `name: clean-di`, `version: 0.0.0`, `type: module`, `main: ./dist/index.js`, `types: ./dist/index.d.ts`, dual `exports` map exposing `.` (public DSL) and `./runtime` (generated-file consumer entry), `scripts: { build: tsc -b, test: vitest run, typecheck: tsc --noEmit, lint: eslint src }`. No runtime dependencies (DESIGN §9.3).
- **Acceptance criteria:**
  - `pnpm -F clean-di install` succeeds.
  - `exports` map is the only published entry surface (no top-level `main` reaching beyond compiled output).
  - `publishConfig.access: public`.
- **Files affected:** `packages/clean-di/package.json`
- **Dependencies:** none
- **Effort:** 6h
- **Parallel-safe with:** all others in W1
- **Notes:** Confirm dual-entry exports map matches DESIGN §6.4. `sideEffects: false` for bundler tree-shaking.

### T-012 Scaffold `packages/clean-di/tsconfig.json`

- **Wave:** W1
- **Description:** Per-package tsconfig extending `tsconfig.base.json`. `rootDir: src`, `outDir: dist`, `composite: true`, `references` empty for now.
- **Acceptance criteria:**
  - `pnpm -F clean-di typecheck` exits 0 against an empty `src/` directory.
- **Files affected:** `packages/clean-di/tsconfig.json`
- **Dependencies:** none
- **Effort:** 4h
- **Parallel-safe with:** all others in W1
- **Notes:** `composite: true` so `clean-di-codegen` can list it under `references`.

### T-013 Scaffold `packages/clean-di-codegen/package.json`

- **Wave:** W1
- **Description:** Create the codegen package manifest. `name: clean-di-codegen`, `type: module`, `bin: { clean-di-codegen: ./dist/bin.js }`. Dependencies: `chokidar`, `picocolors`, `mri` (or `commander` — pick `mri` for size, DESIGN §9.3). Peer dep on `typescript >= 5.0`. Dev dep on `vitest` and the workspace `clean-di` package via `workspace:*`.
- **Acceptance criteria:**
  - `pnpm -F clean-di-codegen install` succeeds.
  - `bin` field correct.
  - `peerDependenciesMeta.typescript.optional: false`.
- **Files affected:** `packages/clean-di-codegen/package.json`
- **Dependencies:** none
- **Effort:** 6h
- **Parallel-safe with:** all others in W1
- **Notes:** `engines.node >= 20`. Locks the four runtime deps named in DESIGN §9.3.

### T-014 Scaffold `packages/clean-di-codegen/tsconfig.json`

- **Wave:** W1
- **Description:** Per-package tsconfig extending the base. `composite: true`. `references: [{ path: "../clean-di" }]` so codegen can `import type` from the runtime package without rebuilding the world.
- **Acceptance criteria:**
  - `pnpm -F clean-di-codegen typecheck` exits 0 against an empty `src/`.
- **Files affected:** `packages/clean-di-codegen/tsconfig.json`
- **Dependencies:** none
- **Effort:** 4h
- **Parallel-safe with:** all others in W1
- **Notes:** Don't auto-build `clean-di` here — leave it explicit via `tsc -b`.

### T-015 Set up Vitest at the root

- **Wave:** W1
- **Description:** Root `vitest.config.ts` with workspace-aware projects pointing at `packages/*/vitest.config.ts`. Per-package configs each set `test.include: ['test/**/*.test.ts']`, `globals: false`, `coverage.provider: 'v8'`, `coverage.thresholds.lines: 90` (100 for `clean-di`, see T-031). Add `vitest` + `@vitest/coverage-v8` to the root devDeps.
- **Acceptance criteria:**
  - `pnpm test` runs zero tests cleanly across an empty workspace.
  - Coverage report writes to `coverage/`.
  - Workspace mode discovers both packages once they exist.
- **Files affected:** `vitest.config.ts`, `vitest.workspace.ts` (if using newer Vitest), `packages/clean-di/vitest.config.ts`, `packages/clean-di-codegen/vitest.config.ts`
- **Dependencies:** none
- **Effort:** 8h
- **Parallel-safe with:** all others in W1
- **Notes:** Higher effort because of workspace-mode quirks. Picks Vitest per DESIGN §10.4.

### T-016 Add repo-wide scripts and Husky-free pre-commit (optional)

- **Wave:** W1
- **Description:** Wire root-level `package.json` scripts: `lint` (`eslint . --max-warnings 0`), `format` (`prettier --write .`), `format:check` (`prettier --check .`), `test` (`vitest run`), `build` (`pnpm -r run build`), `typecheck` (`pnpm -r run typecheck`), `clean` (`rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo`). Optionally add a `simple-git-hooks` or `lefthook` config — but skip Husky.
- **Acceptance criteria:**
  - All listed scripts run end-to-end (some no-op until packages have content).
  - No script depends on a Husky binary.
- **Files affected:** `package.json` (scripts section only — additive to T-001)
- **Dependencies:** T-001 (same file)
- **Effort:** 6h
- **Parallel-safe with:** all others in W1 (mark `T-001` as merge-coordinator if two tasks touch `package.json`)
- **Notes:** This is the only W1 task that shares a file with another (T-001). If they're worked separately, sequence: T-001 first, then T-016. Otherwise fold T-016 into T-001's PR.

---

## W2 — Runtime core + public DSL

W2 produces a fully working `clean-di` runtime with no dependency on codegen output. A hand-written, fixture-style generated file proves the end-to-end runtime path (DESIGN §11 v0.1). All W2 tasks need W1 complete. Within W2, the type and runtime modules are file-disjoint and parallel-safe except for the two re-export entrypoints.

### T-017 Implement shared public types — `types.ts`

- **Wave:** W2
- **Description:** Define `BeanDef<T>`, `Beans` (= `Record<string, BeanDef<unknown>>`), `ContextSpec<TConfig, TBeans>`, `ConfigSpec<TBeans>`, `ExposedOf<TBeans, TExposeKeys>`. These are type-only — no runtime code. Includes the `BeanDef` brand symbol so `bean()` and `provide()` produce distinguishable values at the type level.
- **Acceptance criteria:**
  - All five types exported.
  - `ExposedOf` is equivalent to `Pick<{ [K in keyof TBeans]: InferBeanValue<TBeans[K]> }, TExposeKeys[number]>`.
  - Zero runtime emit (only `export type`/`export interface`).
- **Files affected:** `packages/clean-di/src/public/types.ts`
- **Dependencies:** T-011, T-012
- **Effort:** 8h
- **Parallel-safe with:** all other W2 tasks except T-026/T-027 (entrypoints depend on this)
- **Notes:** Use a unique symbol brand: `declare const BEAN_DEF_BRAND: unique symbol`. See DESIGN §5.1, §5.3, §5.4.

### T-018 Implement `provide.ts`

- **Wave:** W2
- **Description:** Implement `provide<T>(factory: (config: unknown) => T): BeanDef<T>`. At runtime this is just a typed marker — the generated file never calls `provide` at runtime, the codegen reads the factory closure and inlines it. The function returns an object with the brand + a tag `"provide"` and the factory reference (so a hand-written generated file or tests can call it).
- **Acceptance criteria:**
  - Returns a branded `BeanDef<T>`.
  - Type signature matches DESIGN §5.3 exactly.
  - Unit tests cover happy path and brand presence.
- **Files affected:** `packages/clean-di/src/public/provide.ts`, `packages/clean-di/test/public/provide.test.ts`
- **Dependencies:** T-017
- **Effort:** 6h
- **Parallel-safe with:** T-019, T-020, T-021, T-022, T-023, T-024, T-025
- **Notes:** The factory is stored so non-codegen consumers can call it directly; codegen will ignore that and emit the inlined expression.

### T-019 Implement `bean.ts`

- **Wave:** W2
- **Description:** Implement `bean<C extends new (...args: any[]) => any>(Class: C, overrides?: Partial<Record<string, string>>): BeanDef<InstanceType<C>>`. Like `provide`, this is a typed marker — at runtime it just records `{ Class, overrides }` on a branded object. Codegen interprets the marker.
- **Acceptance criteria:**
  - Returns a branded `BeanDef<InstanceType<C>>`.
  - Stores `Class` and `overrides` on the returned object.
  - Type signature matches DESIGN §5.4 exactly.
  - Unit tests cover with and without overrides.
- **Files affected:** `packages/clean-di/src/public/bean.ts`, `packages/clean-di/test/public/bean.test.ts`
- **Dependencies:** T-017
- **Effort:** 6h
- **Parallel-safe with:** T-018, T-020, T-021, T-022, T-023, T-024, T-025
- **Notes:** Yes, this file uses `any` in the constraint — that is the standard TypeScript idiom for "any constructor" and there is no clean alternative. Document inline.

### T-020 Implement `defineConfig.ts`

- **Wave:** W2
- **Description:** Implement `defineConfig<TBeans extends Beans>(spec: ConfigSpec<TBeans>): DefinedConfig<TBeans>`. At runtime it returns a branded marker object holding the spec by reference so codegen can identify the value when it walks the AST. No runtime wiring — codegen pulls beans transitively from the spec.
- **Acceptance criteria:**
  - Returns a branded `DefinedConfig<TBeans>` (`DefinedConfig` is internal to `clean-di`'s public types).
  - Spec object is stored verbatim.
  - Unit test asserts brand + spec identity.
- **Files affected:** `packages/clean-di/src/public/defineConfig.ts`, `packages/clean-di/test/public/defineConfig.test.ts`
- **Dependencies:** T-017
- **Effort:** 8h
- **Parallel-safe with:** T-018, T-019, T-021, T-022, T-023, T-024, T-025
- **Notes:** `DefinedConfig` brand differs from `BeanDef` brand so analyzer can distinguish — important for diagnostic `CDI-010`.

### T-021 Implement `defineContext.ts`

- **Wave:** W2
- **Description:** Implement `defineContext<TConfig = void>()` as the curried factory described in DESIGN §5.1. The outer call captures `TConfig` (no runtime behaviour). The inner call accepts a `ContextSpec<TConfig, TBeans>` and returns a `Container<TConfig, ExposedOf<TBeans, spec["expose"]>>`. At runtime, the inner call returns a marker object — the actual `Container` is produced by the generated file calling `createContext`. The author still gets a typed reference back so their code is type-safe even before codegen runs.
- **Acceptance criteria:**
  - Curried signature compiles per DESIGN §5.1.
  - Returned value is a branded marker that satisfies the `Container<...>` interface at the type level (the runtime methods throw "regenerate your .di.generated.ts" if called pre-codegen — fail-loud guard).
  - Unit test asserts the type signature and the runtime fail-loud guard.
- **Files affected:** `packages/clean-di/src/public/defineContext.ts`, `packages/clean-di/test/public/defineContext.test.ts`
- **Dependencies:** T-017
- **Effort:** 10h
- **Parallel-safe with:** T-018, T-019, T-020, T-022, T-023, T-024, T-025
- **Notes:** This is the most subtle file in W2 — the curried-generics pattern needs to keep `TBeans` inferring while `TConfig` is fixed. The runtime fail-loud guard prevents accidental use of un-codegenned contexts. Document the rationale.

### T-022 Implement `buildResult.ts`

- **Wave:** W2
- **Description:** Define the `BuildResult<TExposed>` interface used by `createContext`. Matches DESIGN §6.2 exactly: `{ bag: Record<string, unknown>, postConstruct?(config): void, preDestroy?(config): void, expose: TExposed }`. Type-only; no runtime emit.
- **Acceptance criteria:**
  - Interface exported.
  - Matches DESIGN §6.2 byte-for-byte.
- **Files affected:** `packages/clean-di/src/runtime/buildResult.ts`
- **Dependencies:** T-012
- **Effort:** 4h
- **Parallel-safe with:** T-018-T-025
- **Notes:** None.

### T-023 Implement `Container.ts`

- **Wave:** W2
- **Description:** Define the `Container<TConfig, TExposed>` interface exactly as DESIGN §6.1 — `get`, `destroy`, `destroyAll`. Also export an internal `CachedInstance<TExposed>` type carrying `{ exposed, preDestroy, config }` for `createContext.ts`'s `Map`. Type-only.
- **Acceptance criteria:**
  - Interface exported and matches DESIGN §6.1.
  - `CachedInstance` is internal (not re-exported from `index.ts`).
- **Files affected:** `packages/clean-di/src/runtime/Container.ts`
- **Dependencies:** T-012
- **Effort:** 6h
- **Parallel-safe with:** T-018-T-025
- **Notes:** The conditional `get` signature (`TConfig extends void ? {key?} : {config, key?}`) is load-bearing for the public API ergonomics.

### T-024 Implement `createContext.ts`

- **Wave:** W2
- **Description:** Implement the runtime entrypoint that the generated file uses. Signature per DESIGN §6.2. Internally maintains `Map<unknown, CachedInstance>` keyed by the `key` parameter (defaults to a module-level `SINGLETON_KEY` symbol). On `get`, if cache hit return cached `exposed`. Else call `builder(config)`, store `{exposed, preDestroy, config}`, run `postConstruct` (rethrow → destroy partial → propagate, emits `CDIE-103`), return `exposed`. On `destroy(key)`, run `preDestroy` (collect errors → `AggregateError` → `CDIE-104`), delete cache entry; warn on unknown key (`CDIE-102`). On `destroyAll`, iterate all keys and call `destroy`.
- **Acceptance criteria:**
  - `get` is idempotent per key (referentially equal returns).
  - `destroy` then `get` for the same key throws `CDIE-101`.
  - `postConstruct` throw triggers `preDestroy` of partial and rethrow.
  - `preDestroy` errors aggregated, never block teardown of other beans.
  - 100% line coverage with unit tests in `test/runtime/createContext.test.ts`.
- **Files affected:** `packages/clean-di/src/runtime/createContext.ts`, `packages/clean-di/test/runtime/createContext.test.ts`
- **Dependencies:** T-022, T-023
- **Effort:** 14h
- **Parallel-safe with:** T-018-T-021, T-025
- **Notes:** This is the runtime tracer (DESIGN §11 v0.1). The hand-written fixture used to validate it lives in T-025.

### T-025 Hand-written generated-file fixture for the runtime

- **Wave:** W2
- **Description:** Write a small, hand-authored `examples-internal/runtime-tracer/SampleContext.di.generated.ts` (under `packages/clean-di/test/fixtures/runtime-tracer/`) that imports `createContext` from `clean-di/runtime` and stands up a tiny three-bean context with a `postConstruct` and `preDestroy`. Build a unit test that imports this fixture and exercises `get`, `destroy`, `destroyAll`, idempotency, error propagation. Proves the runtime works end-to-end before codegen exists (DESIGN §11 v0.1).
- **Acceptance criteria:**
  - Fixture compiles under the package's `tsconfig.json`.
  - Test exercises every documented `Container` behaviour.
  - No reference to `clean-di-codegen`.
- **Files affected:** `packages/clean-di/test/fixtures/runtime-tracer/SampleContext.di.generated.ts`, `packages/clean-di/test/runtime/runtimeTracer.test.ts`
- **Dependencies:** T-024
- **Effort:** 8h
- **Parallel-safe with:** T-017-T-023
- **Notes:** This fixture is the "tracer bullet" called out in DESIGN §11.

### T-026 Wire `packages/clean-di/src/index.ts` (public entry)

- **Wave:** W2
- **Description:** Re-export the public DSL: `defineContext`, `defineConfig`, `provide`, `bean`. Also re-export the user-facing types: `Container`, `BeanDef`, `ContextSpec`, `ConfigSpec`. **Max 9 named exports** (DESIGN §6.4).
- **Acceptance criteria:**
  - Exactly the names listed in DESIGN §6.4 are exported.
  - No accidental wildcard re-exports.
- **Files affected:** `packages/clean-di/src/index.ts`
- **Dependencies:** T-018, T-019, T-020, T-021, T-023
- **Effort:** 4h
- **Parallel-safe with:** T-027
- **Notes:** Set up a small `test/public/api-surface.test.ts` snapshot of `Object.keys(require('clean-di'))` to guard against accidental additions.

### T-027 Wire `packages/clean-di/src/runtime.ts` (secondary entry)

- **Wave:** W2
- **Description:** Re-export `createContext` (value) and `BuildResult` (type) from `runtime/createContext.ts` and `runtime/buildResult.ts`. This is the entry that the generated file imports.
- **Acceptance criteria:**
  - `import { createContext } from 'clean-di/runtime'` resolves.
  - `import type { BuildResult } from 'clean-di/runtime'` resolves.
- **Files affected:** `packages/clean-di/src/runtime.ts`
- **Dependencies:** T-022, T-024
- **Effort:** 4h
- **Parallel-safe with:** T-026
- **Notes:** Ensure the `exports` map in `packages/clean-di/package.json` (T-011) lists `./runtime` correctly.

### T-028 Type-level tests with `expect-type`

- **Wave:** W2
- **Description:** Add a type-level test file proving the curried `defineContext` infers `TBeans`, the `Container.get` overload signature picks the right shape (with/without `config`), and `ExposedOf` correctly narrows to the `expose` whitelist. Use `expect-type` (small, ESM-friendly).
- **Acceptance criteria:**
  - At least four `expectTypeOf(...).toEqualTypeOf(...)` assertions covering the four scenarios above.
  - File runs as part of `pnpm test`.
- **Files affected:** `packages/clean-di/test/types/dsl.test-d.ts`, `packages/clean-di/package.json` (devDep on `expect-type`)
- **Dependencies:** T-026
- **Effort:** 8h
- **Parallel-safe with:** all other W2 tasks once T-026 lands
- **Notes:** DESIGN goal §2.1.7 "Type-safe public surface" — this is the verification.

---

## W3 — Codegen MVP (unambiguous, no imports)

Goal: a working `clean-di-codegen` for the simplest case described in DESIGN §11 v0.2 — single `defineContext`, no `imports`, all bean parameters unambiguously type-resolved. No CLI yet (W5), no overrides/lifecycle/diagnostics polish (W4).

### T-029 Define internal `Diagnostic` and `DiagnosticCode` types — `diagnostics/codes.ts`

- **Wave:** W3
- **Description:** Enumerate `CDI-001`..`CDI-010` and `CDIE-101`..`CDIE-104` as a const-enum-style object. Define the `Diagnostic` type: `{ code: DiagnosticCode, file: string, line: number, column: number, message: string, hint?: string }`. Map codes to default human-readable messages.
- **Acceptance criteria:**
  - All codes from DESIGN §8 enumerated.
  - `Diagnostic` type exported.
  - Default-message map for each code.
- **Files affected:** `packages/clean-di-codegen/src/diagnostics/codes.ts`
- **Dependencies:** T-013, T-014
- **Effort:** 6h
- **Parallel-safe with:** T-030..T-038
- **Notes:** Implementations of `CDI-002` (ambiguous), `CDI-006` (duplicate), etc. land in W4 — but the code constants must exist now so analyzer scaffolding can reference them.

### T-030 Implement `diagnostics/formatDiagnostic.ts`

- **Wave:** W3
- **Description:** Format a `Diagnostic` in standard TypeScript-diagnostic format (`file:line:column - error CDI-NNN: message`). Include optional hint on a second indented line.
- **Acceptance criteria:**
  - Output matches DESIGN §7.6 example.
  - Unit test snapshot on a couple of fixture diagnostics.
- **Files affected:** `packages/clean-di-codegen/src/diagnostics/formatDiagnostic.ts`, `packages/clean-di-codegen/test/diagnostics/formatDiagnostic.test.ts`
- **Dependencies:** T-029
- **Effort:** 6h
- **Parallel-safe with:** T-031..T-038
- **Notes:** No color codes here — coloring is in `report.ts` via picocolors.

### T-031 Implement `diagnostics/report.ts`

- **Wave:** W3
- **Description:** A `DiagnosticReporter` class that collects diagnostics during analysis, dedupes by `(code, file, line, column)`, prints them via `formatDiagnostic` colorized with picocolors, and exposes `hasErrors()`. Drives the exit-code logic of the CLI.
- **Acceptance criteria:**
  - `report.add(d)` accumulates; `report.flush()` prints them; `report.hasErrors()` reflects whether anything was added.
  - Unit tests with captured stdout.
- **Files affected:** `packages/clean-di-codegen/src/diagnostics/report.ts`, `packages/clean-di-codegen/test/diagnostics/report.test.ts`
- **Dependencies:** T-030
- **Effort:** 6h
- **Parallel-safe with:** T-032..T-038
- **Notes:** Keep coloring optional via `process.stdout.isTTY` so CI logs stay plain.

### T-032 Implement `config/defaultConfig.ts`

- **Wave:** W3
- **Description:** Export the default codegen configuration: `include: ['src/**/*.di.ts']`, `exclude: ['**/node_modules/**', '**/*.test.ts']`, `tsconfig: './tsconfig.json'`, `output: 'adjacent'`, default header text (DESIGN §7.8).
- **Acceptance criteria:**
  - Matches DESIGN §7.2.
  - Exported as `defaultConfig` plus a `CleanDiConfig` type.
- **Files affected:** `packages/clean-di-codegen/src/config/defaultConfig.ts`
- **Dependencies:** T-013, T-014
- **Effort:** 4h
- **Parallel-safe with:** T-029..T-038
- **Notes:** `output: 'adjacent'` is the only mode for v1. Type allows other values for forward compat but they throw.

### T-033 Implement `config/loadConfig.ts`

- **Wave:** W3
- **Description:** Resolve a config file: try `clean-di.config.ts`, `clean-di.config.js`, `clean-di.config.mjs`, then `cleanDi` key in `package.json`, then `defaultConfig`. Use a small dynamic `import()` for the `.ts` variant (or `tsx`/`jiti` — pick `jiti` to avoid forcing the user to compile their config). Merge user config over `defaultConfig`.
- **Acceptance criteria:**
  - Resolution order matches DESIGN §7.2.
  - Unit test for each resolution path (mocked fs).
  - Merge is shallow except for `include`/`exclude` which concatenate.
- **Files affected:** `packages/clean-di-codegen/src/config/loadConfig.ts`, `packages/clean-di-codegen/test/config/loadConfig.test.ts`, `packages/clean-di-codegen/package.json` (add `jiti`)
- **Dependencies:** T-032
- **Effort:** 10h
- **Parallel-safe with:** T-029..T-031, T-034..T-038
- **Notes:** `jiti` is the lowest-overhead TS-eval option that doesn't require a build step from the user.

### T-034 Implement `analyzer/parseDiFile.ts`

- **Wave:** W3
- **Description:** Given a `.di.ts` file path and a TS `Program`, parse the source and return its `ts.SourceFile`, plus a typed AST helper that lets the rest of the analyzer find `defineContext` / `defineConfig` / `bean` / `provide` calls by symbol identity (not by name — names can be aliased on import).
- **Acceptance criteria:**
  - Returns `{ sourceFile: ts.SourceFile, calls: { kind: 'defineContext' | 'defineConfig' | 'bean' | 'provide', node: ts.CallExpression }[] }`.
  - Resolves symbol identity through the type checker so `import { bean as b } from 'clean-di'` still works.
  - Unit test on a hand-crafted fixture file.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/parseDiFile.ts`, `packages/clean-di-codegen/test/analyzer/parseDiFile.test.ts`
- **Dependencies:** T-029
- **Effort:** 12h
- **Parallel-safe with:** T-029..T-033, T-035..T-038 (different file, parallel work fine)
- **Notes:** Use `ts.createProgram` with the host's `tsconfig.json` — DESIGN §7.2.

### T-035 Implement `analyzer/collectContexts.ts`

- **Wave:** W3
- **Description:** Given the call list from `parseDiFile`, return one `ContextDeclaration` per `defineContext` call: `{ configTypeName, beans: BeanDeclaration[], expose: string[], postConstruct?, preDestroy?, imports: ts.Expression[] }`. Imports are kept as raw expressions for W4 to resolve; for W3 they're empty.
- **Acceptance criteria:**
  - Returns one declaration per call site.
  - Handles single context per file (multiple is allowed but warned about as a smell).
  - `beans` field captures each entry's `(name, ts.CallExpression)`.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/collectContexts.ts`, `packages/clean-di-codegen/test/analyzer/collectContexts.test.ts`
- **Dependencies:** T-034
- **Effort:** 10h
- **Parallel-safe with:** T-036..T-038 (different files)
- **Notes:** Leave a TODO in the imports handling for W4.

### T-036 Implement `analyzer/buildBeanScope.ts` (MVP — locals only)

- **Wave:** W3
- **Description:** Build the bean scope for a context: for v3, just the local `beans` of the context. For each entry, record `{ name, kind: 'bean' | 'provide', class?: ts.ClassDeclaration, providerType?: ts.Type, overrides?: Record<string,string> }`. Imports are added in W4.
- **Acceptance criteria:**
  - Returns a `BeanScope` object indexed by name.
  - Distinguishes `bean(...)` from `provide(...)` entries.
  - Captures the overrides map of `bean(Class, overrides)` even though resolution uses it only in W4.
  - Unit tests.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/buildBeanScope.ts`, `packages/clean-di-codegen/test/analyzer/buildBeanScope.test.ts`
- **Dependencies:** T-035
- **Effort:** 10h
- **Parallel-safe with:** T-037, T-038
- **Notes:** Scope type defined here is shared with W4.

### T-037 Implement `analyzer/resolveOneParam.ts` (MVP — unambiguous only)

- **Wave:** W3
- **Description:** Given a constructor parameter (name + type) and a `BeanScope`, return the resolved bean name. v3 logic: filter scope to entries whose declared type is `checker.isTypeAssignableTo` the param type. If exactly one — return it. Zero or multiple — emit `CDI-001` (zero) or `CDI-002` (multiple) via the reporter; in W3, both are placeholders that throw "not yet supported". W4 adds name fallback + overrides.
- **Acceptance criteria:**
  - Resolves a parameter when exactly one type-match exists.
  - On zero or multiple matches, calls `reporter.add(CDI-001 or CDI-002)` with the failing param location.
  - Unit tests on a small fixture with two beans, three params.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/resolveOneParam.ts`, `packages/clean-di-codegen/test/analyzer/resolveOneParam.test.ts`
- **Dependencies:** T-036
- **Effort:** 14h
- **Parallel-safe with:** T-038
- **Notes:** Generic param invariance (DESIGN §7.4): `Repository<Post>` ≠ `Repository<Comment>`. Honour `param?: T` and `param: T = default` as optional (omit if unresolvable) — DESIGN §7.4.

### T-038 Implement `analyzer/resolveConstructor.ts`

- **Wave:** W3
- **Description:** Given a `ts.ClassDeclaration` and a `BeanScope`, get its constructor signature via the checker, iterate parameters, call `resolveOneParam` for each, and return the array of resolved bean names in positional order. Classes without an explicit constructor — return `[]`. Private/protected constructor — emit `CDI-008`.
- **Acceptance criteria:**
  - Returns an ordered array of resolved names.
  - Handles zero-arg constructor (empty array).
  - Handles missing constructor (defaults to zero args).
  - Refuses spread/destructure constructors with `CDI-008`.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/resolveConstructor.ts`, `packages/clean-di-codegen/test/analyzer/resolveConstructor.test.ts`
- **Dependencies:** T-037
- **Effort:** 10h
- **Parallel-safe with:** T-039, T-040 (different files; sequential ordering only via T-037)
- **Notes:** DESIGN §7.3 step 3, §Open-Q7 (private/protected refused).

### T-039 Implement `analyzer/topoSort.ts`

- **Wave:** W3
- **Description:** Given a map `{ beanName -> resolvedDeps: string[] }`, return the beans in dependency order. Detect cycles; on cycle, emit `CDI-003` with the cycle path. Algorithm: iterative Kahn's algorithm or DFS with marker.
- **Acceptance criteria:**
  - Returns the linear topo order for an acyclic graph.
  - On cycle, returns null and pushes one `CDI-003` diagnostic with the cycle nodes.
  - Unit tests: simple chain, diamond DAG, cycle of 2, cycle of 3.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/topoSort.ts`, `packages/clean-di-codegen/test/analyzer/topoSort.test.ts`
- **Dependencies:** T-029
- **Effort:** 8h
- **Parallel-safe with:** T-034..T-038, T-040 (purely algorithmic, no AST access)
- **Notes:** Cycle detection per DESIGN §7.6.

### T-040 Implement `emitter/hash.ts`

- **Wave:** W3
- **Description:** Compute a SHA-256 hash of: `(sourceFile content) + (resolved-constructor-signature snapshot) + (generator version from package.json)`. Returns a hex string. Used in the generated file header (DESIGN §7.9).
- **Acceptance criteria:**
  - Deterministic on identical inputs.
  - Changes when any of the three components change.
  - Unit test asserts each invariant.
- **Files affected:** `packages/clean-di-codegen/src/emitter/hash.ts`, `packages/clean-di-codegen/test/emitter/hash.test.ts`
- **Dependencies:** T-013
- **Effort:** 6h
- **Parallel-safe with:** all other W3 tasks (no shared symbols)
- **Notes:** Use Node's built-in `crypto`.

### T-041 Implement `emitter/formatGenerated.ts`

- **Wave:** W3
- **Description:** Render the final TypeScript text of a `.di.generated.ts` file. Takes the topo-sorted bean list, the resolved constructor argument arrays, the `expose` list, the config type name, and the file's import edges. Output matches DESIGN §7.8 exactly: header comment block, imports, single `createContext<TConfig, Exposed>` call with all `const xxx = ...` bindings in topo order, `bag` and `expose` returns.
- **Acceptance criteria:**
  - Snapshot test against the DESIGN §7.8 example produces identical text.
  - Header block includes generator version + source path + hash.
- **Files affected:** `packages/clean-di-codegen/src/emitter/formatGenerated.ts`, `packages/clean-di-codegen/test/emitter/formatGenerated.test.ts`
- **Dependencies:** T-029, T-040
- **Effort:** 12h
- **Parallel-safe with:** T-034..T-040 (different file)
- **Notes:** Output is hand-formatted (not via Prettier) to keep determinism. Lock the format so the `.prettierignore` from T-006 can skip it.

### T-042 Wire `emitter/emitGeneratedFile.ts` (MVP integration)

- **Wave:** W3
- **Description:** The orchestration function: given a `.di.ts` path, run `parseDiFile` → `collectContexts` → `buildBeanScope` → for each bean call `resolveConstructor` → `topoSort` → `formatGenerated` → write the file. Skip writing if the computed hash matches the committed file's hash (DESIGN §7.9).
- **Acceptance criteria:**
  - Given a fixture single-context unambiguous `.di.ts`, emits the expected `.di.generated.ts` byte-for-byte.
  - Re-running without changes is a no-op (hash skip).
  - Returns a `RunResult` carrying `{ wrote: boolean, diagnostics: Diagnostic[] }`.
- **Files affected:** `packages/clean-di-codegen/src/emitter/emitGeneratedFile.ts`, `packages/clean-di-codegen/test/fixtures/unambiguous/input.di.ts`, `packages/clean-di-codegen/test/fixtures/unambiguous/expected.di.generated.ts`, `packages/clean-di-codegen/test/emitter/emitGeneratedFile.test.ts`
- **Dependencies:** T-031, T-033, T-038, T-039, T-041
- **Effort:** 14h
- **Parallel-safe with:** T-040 only (sequential after most of W3)
- **Notes:** This is the MVP gate (DESIGN §11 v0.2). Internally the fixture/test infra introduced here is reused for W4 fixtures.

---

## W4 — Codegen full (overrides, imports, lifecycle, all diagnostics)

W4 extends W3 in-place. Most tasks edit a file W3 created. Within W4, tasks editing different files are parallel-safe.

### T-043 Override resolution in `resolveOneParam.ts`

- **Wave:** W4
- **Description:** Extend `resolveOneParam` so that if the bean's `overrides[paramName]` exists, the resolution uses the named bean directly (checked for existence in scope + type-assignable). Emit `CDI-001` if the override target doesn't exist or doesn't assignable-match.
- **Acceptance criteria:**
  - Override wins over type matching.
  - Mismatched override type → `CDI-001` with hint pointing at the override.
  - New fixture `test/fixtures/ambiguous-with-override/` exercises this end-to-end.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/resolveOneParam.ts` (extend), `packages/clean-di-codegen/test/fixtures/ambiguous-with-override/{input.di.ts,expected.di.generated.ts}`
- **Dependencies:** T-037
- **Effort:** 8h
- **Parallel-safe with:** T-044, T-045 (logical layering: T-044 also edits resolveOneParam.ts — sequence T-043 → T-044 in that one file)
- **Notes:** DESIGN §7.3 step 3a, §5.4.

### T-044 Name fallback in `resolveOneParam.ts`

- **Wave:** W4
- **Description:** After type filtering and override check, if zero or multiple matches remain, fall back to comparing the parameter name verbatim against bean keys (case-sensitive). If exactly one type-match still exists with a matching name → use it. If multiple type-matches and one of them has a matching name → use that one. If multiple type-matches and none has a matching name → emit `CDI-002`. If zero type-matches and no name-fallback → emit `CDI-001`.
- **Acceptance criteria:**
  - Per DESIGN §7.3 step 3d/e and §7.5.
  - New fixture `test/fixtures/name-fallback/`.
  - `CDI-002` fires only when ambiguity truly remains.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/resolveOneParam.ts`, `packages/clean-di-codegen/test/fixtures/name-fallback/{input.di.ts,expected.di.generated.ts}`
- **Dependencies:** T-043
- **Effort:** 10h
- **Parallel-safe with:** T-045..T-055 (different files except resolveOneParam.ts, which is sequenced after T-043)
- **Notes:** No camelCase / kebab normalization — DESIGN §7.5.

### T-045 Imports resolution in `buildBeanScope.ts`

- **Wave:** W4
- **Description:** Extend `buildBeanScope` to walk `imports: [...]`, resolve each entry to a `defineConfig` instance via the type checker, pull its beans into scope, recurse transitively. Deduplicate by `defineConfig` reference identity (diamond imports — DESIGN §5.5). Emit `CDI-010` if an entry isn't a `defineConfig` result. Emit `CDI-006` on name collision between local beans and imported beans.
- **Acceptance criteria:**
  - Single-level import works.
  - Two-level (transitive) import works.
  - Diamond — same `defineConfig` imported through two paths — yields one bean set, not two.
  - `CDI-006` fires on name collision; `CDI-010` fires on non-defineConfig import.
  - New fixtures: `test/fixtures/imports/`, `test/fixtures/diamond-imports/`, plus negative fixtures `test/fixtures/cdi-006-duplicate-bean/` and `test/fixtures/cdi-010-invalid-import/`.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/buildBeanScope.ts`, four fixture folders
- **Dependencies:** T-036
- **Effort:** 14h
- **Parallel-safe with:** T-043, T-044, T-046..T-055 (different files; some fixture folders overlap with T-049's emitter changes but the fixture inputs are file-disjoint)
- **Notes:** DESIGN §5.5, §7.3 step 2.

### T-046 Synthetic config beans in `buildBeanScope.ts`

- **Wave:** W4
- **Description:** For each field of `TConfig`, generate a synthetic scope entry `{ name: fieldName, kind: 'config', type: cfgFieldType }` that is **addressable only by name** via `provide`. The codegen never auto-wires constructor params from config — `provide` is the documented bridge (DESIGN §5.3). But the bean-scope diagnostic surface needs them so name fallback to `cfg.x` works cleanly when relevant.
- **Acceptance criteria:**
  - Config-derived beans visible in scope.
  - Name-fallback can match them.
  - If `TConfig` is `void`, no synthetic beans.
  - Updates the `imports` fixture to demonstrate.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/buildBeanScope.ts` (extend)
- **Dependencies:** T-045
- **Effort:** 8h
- **Parallel-safe with:** T-047..T-055 (other files); sequenced after T-045 on `buildBeanScope.ts`
- **Notes:** DESIGN §7.3 step 2 third bullet.

### T-047 Validate `expose` whitelist (`CDI-004`)

- **Wave:** W4
- **Description:** After scope is built, check every name in `expose` exists in scope. Emit `CDI-004 MissingExposeTarget` if not. Add a negative fixture.
- **Acceptance criteria:**
  - Missing name fires `CDI-004`.
  - Fixture `test/fixtures/cdi-004-missing-expose/`.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/collectContexts.ts` (light extend) or a new `analyzer/validateExpose.ts` (preferred), plus fixture
- **Dependencies:** T-046
- **Effort:** 6h
- **Parallel-safe with:** T-043..T-046, T-048..T-055
- **Notes:** New file preferred for separation (analyzer/validateExpose.ts).

### T-048 Diagnostic `CDI-005 InvalidContextShape`

- **Wave:** W4
- **Description:** Validate the shape of the `defineContext` call: must be curried (`defineContext<T>()(spec)`); spec must have `beans` (required) and `expose` (required) keys. If malformed → `CDI-005`. Negative fixture.
- **Acceptance criteria:**
  - Missing curry, missing `beans`, missing `expose`, wrong types — each fires `CDI-005`.
  - Fixture `test/fixtures/cdi-005-invalid-context-shape/`.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/collectContexts.ts` (extend), fixture
- **Dependencies:** T-035
- **Effort:** 8h
- **Parallel-safe with:** T-043..T-047, T-049..T-055
- **Notes:** DESIGN §8.1.

### T-049 Lifecycle hook wiring in `emitter/formatGenerated.ts`

- **Wave:** W4
- **Description:** Extend `formatGenerated` so that when the context spec contains `postConstruct` and/or `preDestroy`, the generated `createContext` callback returns those alongside `bag` and `expose`. The hooks are passed through verbatim from the source — the codegen reads them as `ts.ArrowFunction` or `ts.FunctionExpression` AST nodes and re-emits them as-is (using the printer). Execution order: `postConstruct` imports-first-then-parent, `preDestroy` parent-first-then-imports-reverse (DESIGN §5.6).
- **Acceptance criteria:**
  - Generated file includes the hook functions.
  - Execution order matches DESIGN §5.6 (encoded by the order the codegen wires them into the parent's `postConstruct`/`preDestroy`).
  - New fixture `test/fixtures/lifecycle/`.
- **Files affected:** `packages/clean-di-codegen/src/emitter/formatGenerated.ts` (extend), `packages/clean-di-codegen/src/analyzer/collectContexts.ts` (extract hooks), fixture
- **Dependencies:** T-041, T-045
- **Effort:** 14h
- **Parallel-safe with:** T-043..T-048, T-050..T-055 (different file sections; sequenced after T-041 on formatGenerated.ts)
- **Notes:** This is the v0.5 milestone (DESIGN §11). Aggregated imports-hooks → parent-hook composition is the load-bearing detail.

### T-050 Diagnostic `CDI-007 InvalidBeanDef`

- **Wave:** W4
- **Description:** In `collectContexts` / `buildBeanScope`, when iterating the `beans` map, refuse entries whose RHS is not the result of `bean(...)` or `provide(...)`. Emit `CDI-007`. Negative fixture.
- **Acceptance criteria:**
  - Plain literal / arrow function / class reference RHS fires `CDI-007`.
  - Fixture `test/fixtures/cdi-007-invalid-bean-def/`.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/buildBeanScope.ts`, fixture
- **Dependencies:** T-036
- **Effort:** 6h
- **Parallel-safe with:** T-043..T-049, T-051..T-055
- **Notes:** Brand identity check on the BeanDef symbol (T-017).

### T-051 Diagnostic `CDI-008 UnsupportedConstructor`

- **Wave:** W4
- **Description:** In `resolveConstructor`, refuse constructors that use rest/spread parameters, destructured parameters, or are private/protected. Emit `CDI-008`. Negative fixture.
- **Acceptance criteria:**
  - Rest param fires `CDI-008`.
  - Destructured object param fires `CDI-008`.
  - Private/protected constructor fires `CDI-008`.
  - Fixture `test/fixtures/cdi-008-unsupported-constructor/`.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/resolveConstructor.ts` (extend), fixture
- **Dependencies:** T-038
- **Effort:** 6h
- **Parallel-safe with:** T-043..T-050, T-052..T-055
- **Notes:** DESIGN §Open-Q7, §8.1.

### T-052 Diagnostic `CDI-009 ConfigTypeNotFound`

- **Wave:** W4
- **Description:** In `collectContexts`, when extracting `TConfig` from `defineContext<TConfig>()`, if the referenced type cannot be resolved by the checker, emit `CDI-009`. Negative fixture.
- **Acceptance criteria:**
  - Unresolved config type fires `CDI-009`.
  - Fixture `test/fixtures/cdi-009-config-type-not-found/`.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/collectContexts.ts` (extend), fixture
- **Dependencies:** T-035
- **Effort:** 6h
- **Parallel-safe with:** T-043..T-051, T-053..T-055
- **Notes:** DESIGN §8.1.

### T-053 Wire up complete fixture catalog (positive + negative)

- **Wave:** W4
- **Description:** Audit `test/fixtures/` for completeness. There should be **one positive fixture per scenario** (`unambiguous`, `ambiguous-with-override`, `name-fallback`, `imports`, `diamond-imports`, `lifecycle`) and **one negative fixture per diagnostic code** (`cdi-001`..`cdi-010`). Build a single `e2e.test.ts` that iterates every fixture: positives must produce the committed `expected.di.generated.ts` byte-for-byte; negatives must produce the committed `expected-diagnostics.json`.
- **Acceptance criteria:**
  - 6 positive fixtures + 10 negative fixtures present.
  - `e2e.test.ts` iterates all and passes.
  - Fixture loader helper (`test/util/loadFixture.ts`) shared across the suite.
- **Files affected:** `packages/clean-di-codegen/test/e2e.test.ts`, `packages/clean-di-codegen/test/util/loadFixture.ts`, any missing fixture folders flagged during audit
- **Dependencies:** T-042, T-043, T-044, T-045, T-047, T-048, T-049, T-050, T-051, T-052
- **Effort:** 12h
- **Parallel-safe with:** none in W4 (this is the integrator)
- **Notes:** DESIGN §10.2 — fixture-based testing is the testing strategy.

### T-054 Type-checker integration polish — generic invariance & optional params

- **Wave:** W4
- **Description:** Audit `resolveOneParam` against DESIGN §7.4 corner cases: generic invariance (`Repository<Post>` vs `Repository<Comment>` — must NOT match), `T | U` union supertype matching (subtype satisfies union), optional and defaulted params (omit if unresolvable), `any`/`never` params (refuse with `CDI-002` — never silently match all). Add targeted unit tests.
- **Acceptance criteria:**
  - Each rule in DESIGN §7.4 has a unit test asserting the rule.
  - No fixture changes — pure analyzer test.
- **Files affected:** `packages/clean-di-codegen/src/analyzer/resolveOneParam.ts` (minor extends), `packages/clean-di-codegen/test/analyzer/resolveOneParam.typeRules.test.ts`
- **Dependencies:** T-044
- **Effort:** 10h
- **Parallel-safe with:** T-043..T-053, T-055 (file-shared with T-043/T-044 — sequence T-043 → T-044 → T-054)
- **Notes:** This is the DESIGN §7.4 conformance gate.

### T-055 Generator-version + format hash invariance pass

- **Wave:** W4
- **Description:** Verify that the hash computed by `hash.ts` correctly invalidates when (a) the source `.di.ts` changes, (b) a referenced class constructor changes, (c) the generator version bumps. Add a `--debug-hash` flag to the analyzer that prints which input changed. (CLI surfacing of this flag lands in W5.)
- **Acceptance criteria:**
  - Three unit tests exercising each invalidation path.
  - Hash format documented in a code comment.
- **Files affected:** `packages/clean-di-codegen/src/emitter/hash.ts` (extend), `packages/clean-di-codegen/test/emitter/hash.invariance.test.ts`
- **Dependencies:** T-040, T-042
- **Effort:** 8h
- **Parallel-safe with:** T-043..T-054 (file-disjoint)
- **Notes:** DESIGN §7.9.

---

## W5 — CLI (watch, check, args, config)

Most of W5 can start once W3 lands (the analyzer + emitter API is stable). Only T-063 needs W4 fully complete (it integration-tests `--check` against fixtures with every CDI code).

### T-056 Implement `cli/args.ts`

- **Wave:** W5
- **Description:** Parse CLI arguments using `mri`. Recognise: `--watch`, `--check`, `--config <path>`, `--debug-hash`, `--help`, `--version`. Return a typed `CliArgs` discriminated union: `{ mode: 'once' | 'watch' | 'check', configPath?: string, debugHash: boolean }`.
- **Acceptance criteria:**
  - All flags from DESIGN §7.1 parsed.
  - Unknown flags fail with a clear error.
  - Unit tests on each combination.
- **Files affected:** `packages/clean-di-codegen/src/cli/args.ts`, `packages/clean-di-codegen/test/cli/args.test.ts`
- **Dependencies:** T-013, T-014
- **Effort:** 6h
- **Parallel-safe with:** T-057..T-064
- **Notes:** Could start in parallel with W3 once T-013/T-014 land. Wave assignment is conservative.

### T-057 Implement `cli/main.ts` (once-mode driver)

- **Wave:** W5
- **Description:** The orchestrator for one-shot `clean-di-codegen`: load config, glob `include`/`exclude` against the file system, instantiate one `ts.Program` covering all `.di.ts` files, call `emitGeneratedFile` per file, flush the reporter, exit 1 if any error.
- **Acceptance criteria:**
  - Running on a fixture directory produces the expected committed outputs.
  - Exit code 1 on diagnostic, 0 on success.
  - Single `ts.Program` (not one per file — perf).
- **Files affected:** `packages/clean-di-codegen/src/cli/main.ts`, `packages/clean-di-codegen/test/cli/main.test.ts`
- **Dependencies:** T-033, T-042, T-056
- **Effort:** 12h
- **Parallel-safe with:** T-058, T-059, T-060, T-061
- **Notes:** Reuse `ts.Program` across files — important for codegen perf in large repos.

### T-058 Implement `cli/watch.ts`

- **Wave:** W5
- **Description:** Watch mode using chokidar. Watch the `include` globs; debounce 50ms; on change, re-run `emitGeneratedFile` for affected files only (and downstream contexts whose imports transitively contain a changed `defineConfig`). On error, log the diagnostic and keep watching (DESIGN §7.7).
- **Acceptance criteria:**
  - Editing a `.di.ts` triggers regeneration.
  - Editing a class referenced by a `.di.ts` triggers regeneration of the dependent context (constructor-signature hash check).
  - Errors do not kill the watcher.
- **Files affected:** `packages/clean-di-codegen/src/cli/watch.ts`, `packages/clean-di-codegen/test/cli/watch.test.ts`
- **Dependencies:** T-057
- **Effort:** 10h
- **Parallel-safe with:** T-059, T-060, T-061
- **Notes:** Mock chokidar in tests.

### T-059 Implement `cli/check.ts`

- **Wave:** W5
- **Description:** `--check` mode: run the full codegen in-memory; for each file, compare the would-be-emitted bytes against the committed `.di.generated.ts`. Any mismatch (including missing file) → log a clear diff hint and exit 1. CI's primary entry point for catching forgotten regenerations.
- **Acceptance criteria:**
  - Mismatch exits 1 and prints which file is stale.
  - Match exits 0.
  - Missing committed file is treated as stale.
- **Files affected:** `packages/clean-di-codegen/src/cli/check.ts`, `packages/clean-di-codegen/test/cli/check.test.ts`
- **Dependencies:** T-057
- **Effort:** 8h
- **Parallel-safe with:** T-058, T-060, T-061
- **Notes:** DESIGN §7.9.

### T-060 Implement `cli/bin.ts` (binary entrypoint)

- **Wave:** W5
- **Description:** Shebanged entry script (`#!/usr/bin/env node`) that imports `cli/args.ts` + `cli/main.ts` + `cli/watch.ts` + `cli/check.ts`, dispatches on `args.mode`, sets `process.exitCode` accordingly. Print colorized banner with version on startup.
- **Acceptance criteria:**
  - `node packages/clean-di-codegen/dist/bin.js --help` prints help.
  - All three modes dispatch correctly.
  - Built file is executable (`chmod +x`).
- **Files affected:** `packages/clean-di-codegen/src/cli/bin.ts`, `packages/clean-di-codegen/package.json` (verify `bin` field)
- **Dependencies:** T-056, T-057, T-058, T-059
- **Effort:** 6h
- **Parallel-safe with:** none in W5 (it's the integrator)
- **Notes:** Use `tsc` postbuild to add the shebang or include it in source (TypeScript honors `#!` only on first line — verify).

### T-061 Implement `packages/clean-di-codegen/src/index.ts` (programmatic entry)

- **Wave:** W5
- **Description:** Re-export `runOnce(config)`, `runWatch(config)`, `runCheck(config)`, and the `Diagnostic`/`DiagnosticCode` types so the codegen can be embedded in a build script. Keep small — three functions + a couple of types.
- **Acceptance criteria:**
  - Programmatic API documented.
  - Used by a smoke test (`test/programmatic.test.ts`).
- **Files affected:** `packages/clean-di-codegen/src/index.ts`, `packages/clean-di-codegen/test/programmatic.test.ts`
- **Dependencies:** T-057, T-058, T-059
- **Effort:** 6h
- **Parallel-safe with:** T-060
- **Notes:** Surfaces the codegen as a library too, not only a CLI.

### T-062 Standardise reporter formatting under TTY vs non-TTY

- **Wave:** W5
- **Description:** Polish `diagnostics/report.ts` (W3 created it) so coloring only happens when `process.stdout.isTTY` is true, and add a `--no-color` override flag. Make sure GitHub Actions output (no TTY) is readable.
- **Acceptance criteria:**
  - Plain output under no-TTY.
  - Colored under TTY.
  - `--no-color` forces plain.
- **Files affected:** `packages/clean-di-codegen/src/diagnostics/report.ts` (extend), `packages/clean-di-codegen/src/cli/args.ts` (add flag)
- **Dependencies:** T-031, T-056
- **Effort:** 4h
- **Parallel-safe with:** T-056..T-061
- **Notes:** DESIGN §7.7 — editor-friendly output.

### T-063 End-to-end CLI integration test against the fixture corpus

- **Wave:** W5
- **Description:** Add `test/cli.e2e.test.ts` that spawns the built `bin.js` against a temp directory seeded from each fixture and asserts the produced output (and exit code). Covers `once`, `--watch` (with a short timeout), `--check` (positive and negative). This is the gate that `--check` reliably catches every CDI-NNN case.
- **Acceptance criteria:**
  - All 6 positive + 10 negative fixtures exercised via the spawned CLI.
  - Exit codes match expectations.
  - Watch mode test triggers a regeneration and exits cleanly.
- **Files affected:** `packages/clean-di-codegen/test/cli.e2e.test.ts`
- **Dependencies:** T-053, T-060
- **Effort:** 10h
- **Parallel-safe with:** none in W5
- **Notes:** Needs W4 fully complete because it exercises every diagnostic.

### T-064 Update CI workflow to run `clean-di-codegen --check`

- **Wave:** W5
- **Description:** Edit the CI workflow created in T-010 to add a final step: `pnpm -F clean-di-codegen run check:examples` which runs `clean-di-codegen --check` against the `examples/` directory. This catches forgotten regenerations in PRs.
- **Acceptance criteria:**
  - Workflow step added.
  - Step references a script that exists.
  - Step fails if any example's `.di.generated.ts` is stale.
- **Files affected:** `.github/workflows/ci.yml` (edit), `packages/clean-di-codegen/package.json` (add `check:examples` script)
- **Dependencies:** T-010, T-060
- **Effort:** 4h
- **Parallel-safe with:** T-056..T-062 (different file from T-063)
- **Notes:** The script can't actually run successfully until W6 commits the example outputs — leave the step in but expect it to first go green at end of W6.

---

## W6 — Examples + documentation

W6 demonstrates the library. All examples follow the same pattern, so the three example tasks are mostly parallel-safe. Docs are independent files.

### T-065 Build `examples/basic/` — single context, no imports

- **Wave:** W6
- **Description:** Minimal example: one `Logger` class, one `Greeter` class, one `GreeterContext.di.ts` with `defineContext<{ name: string }>()`. Run `clean-di-codegen`, commit the resulting `.di.generated.ts`. Add a tiny `index.ts` that instantiates the context and prints a greeting. Include a `package.json` (workspace dep on `clean-di` and devDep on `clean-di-codegen`), `tsconfig.json` (extends base), `README.md` explaining each piece.
- **Acceptance criteria:**
  - `pnpm -F basic build && pnpm -F basic start` prints the greeting.
  - `clean-di-codegen --check` is clean for this directory.
  - README walks a reader through the file structure.
- **Files affected:** `examples/basic/package.json`, `examples/basic/tsconfig.json`, `examples/basic/src/Logger.ts`, `examples/basic/src/Greeter.ts`, `examples/basic/src/GreeterContext.di.ts`, `examples/basic/src/GreeterContext.di.generated.ts`, `examples/basic/src/index.ts`, `examples/basic/README.md`
- **Dependencies:** T-026, T-027, T-060
- **Effort:** 8h
- **Parallel-safe with:** T-066, T-067, T-070..T-073
- **Notes:** This is the smallest possible demonstration — used by GETTING_STARTED.md.

### T-066 Build `examples/modular/` — context with one sub-config

- **Wave:** W6
- **Description:** Two-module example: one `defineConfig` holding `MathConfig.di.ts` (an `Adder` + `Multiplier`), one `defineContext` `CalcContext.di.ts` that imports it and adds a top-level `Calculator` use case. Demonstrates `imports: [...]`. Includes its own `package.json`, generated files, README.
- **Acceptance criteria:**
  - Demonstrates `imports: []` end-to-end.
  - Generated files committed and pass `--check`.
  - README explains the `imports` mechanism.
- **Files affected:** `examples/modular/package.json`, `examples/modular/tsconfig.json`, `examples/modular/src/math/Adder.ts`, `examples/modular/src/math/Multiplier.ts`, `examples/modular/src/math/MathConfig.di.ts`, `examples/modular/src/math/MathConfig.di.generated.ts`, `examples/modular/src/calc/Calculator.ts`, `examples/modular/src/calc/CalcContext.di.ts`, `examples/modular/src/calc/CalcContext.di.generated.ts`, `examples/modular/src/index.ts`, `examples/modular/README.md`
- **Dependencies:** T-026, T-027, T-060
- **Effort:** 10h
- **Parallel-safe with:** T-065, T-067, T-070..T-073
- **Notes:** Smallest viable demonstration of imports.

### T-067 Build `examples/full-blog-app/` — comprehensive demo

- **Wave:** W6
- **Description:** The full Appendix-A demo: `Logger`, `HttpPostsRepository`, `ListPostsUseCase`, `CreatePostUseCase`, `HttpCommentsRepository`, `ListCommentsUseCase`, `DeleteCommentUseCase`, `HttpUsersRepository`, `GetCurrentUserUseCase`, plus the three `.di.ts` files (`CommentsConfig`, `UsersConfig`, `BlogContext`). Lifecycle hooks. Mocked `fetch` so it can run in CI without network. README narrates the design choices.
- **Acceptance criteria:**
  - Builds and runs in CI.
  - All `.di.generated.ts` committed.
  - `--check` clean.
  - Demonstrates: imports, lifecycle, expose, provide, bean, name fallback (at least one constructor with an ambiguous-by-type param disambiguated by name).
- **Files affected:** `examples/full-blog-app/...` (~15 source files matching DESIGN Appendix A)
- **Dependencies:** T-026, T-027, T-060
- **Effort:** 16h
- **Parallel-safe with:** T-065, T-066, T-070..T-073
- **Notes:** This is the showcase. The README is its own marketing surface.

### T-068 Wire examples into the workspace and CI

- **Wave:** W6
- **Description:** Update `pnpm-workspace.yaml` (already includes `examples/*` from T-002) — verify. Add a root-level `examples:build` script that runs `pnpm -F basic build && pnpm -F modular build && pnpm -F full-blog-app build`. Add a CI step that runs it after `clean-di-codegen --check`.
- **Acceptance criteria:**
  - All three examples build in CI.
  - The `check:examples` script from T-064 actually points at the right `examples/` glob and goes green.
- **Files affected:** `package.json` (add scripts), `.github/workflows/ci.yml` (edit)
- **Dependencies:** T-064, T-065, T-066, T-067
- **Effort:** 6h
- **Parallel-safe with:** none in W6 (it's the integrator)
- **Notes:** This is where the green light finally lights up for the W6 example trio.

### T-069 Write `doc/README.md` (user-facing)

- **Wave:** W6
- **Description:** Replace the repo-stub `README.md` (T-009) with the real one (or write `doc/README.md` as the canonical user-facing landing page — pick one and link from the other). Includes: pitch (one paragraph), feature bullets, installation, three-line tour (`defineContext`, run codegen, use container), link to `GETTING_STARTED.md` and `MIGRATION.md`, comparison table from DESIGN Appendix B.
- **Acceptance criteria:**
  - Renders cleanly on GitHub.
  - All code samples copy-pasteable.
  - Comparison table accurate.
- **Files affected:** `doc/README.md`, possibly `README.md` (repo-level — update to point at `doc/README.md`)
- **Dependencies:** T-065, T-066, T-067
- **Effort:** 8h
- **Parallel-safe with:** T-070, T-071, T-072, T-073
- **Notes:** Reference the `examples/` for live code; do not duplicate.

### T-070 Write `doc/GETTING_STARTED.md`

- **Wave:** W6
- **Description:** A 15-minute quickstart: install `clean-di` + `clean-di-codegen`, write a `Greeter.di.ts` matching the `basic` example, run the codegen, consume the container, common pitfalls, where to go next. Targeted at someone who's never seen the library before.
- **Acceptance criteria:**
  - Code samples match the `basic` example.
  - Includes the codegen run command.
  - Mentions `--check` for CI.
- **Files affected:** `doc/GETTING_STARTED.md`
- **Dependencies:** T-065
- **Effort:** 8h
- **Parallel-safe with:** T-069, T-071, T-072, T-073
- **Notes:** Don't re-explain why — link to DESIGN.md for that.

### T-071 Write `doc/MIGRATION.md`

- **Wave:** W6
- **Description:** Migration guide from common DI libraries to `clean-di`. Sections for: Inversify (decorator removal + scope mapping), tsyringe (similar), Brandi (factories → `provide`, manual wiring → `bean`), Awilix (CLASSIC: drop `static inject` arrays; PROXY: rename to constructor params; scopes → keys), Clawject (drop `ts-patch` + `@Configuration`). Each section: before/after code, a checklist, gotchas.
- **Acceptance criteria:**
  - Five migration sections.
  - Each has a runnable before-and-after snippet.
  - Scope-mapping table for each library.
- **Files affected:** `doc/MIGRATION.md`
- **Dependencies:** T-067 (full-blog-app exercises every feature referenced in migrations)
- **Effort:** 12h
- **Parallel-safe with:** T-069, T-070, T-072, T-073
- **Notes:** Reference DESIGN Appendix B for the comparison rationale; this doc is operational, not theoretical.

### T-072 Generate API reference with typedoc

- **Wave:** W6
- **Description:** Add `typedoc` as a root devDep. Configure it to document the `clean-di` package only (the public surface in DESIGN §6.4). Output to `doc/api/`. Add a `pnpm docs:api` script. Verify the output renders the 9 named exports with full type signatures and JSDoc comments. Note: doc comments need to be added to the W2 source files (back-fill).
- **Acceptance criteria:**
  - `pnpm docs:api` produces a static site under `doc/api/`.
  - All 9 public exports documented.
  - JSDoc back-filled on each W2 public file.
- **Files affected:** `typedoc.json`, `package.json` (add script + devDep), JSDoc additions to `packages/clean-di/src/public/*.ts` and `packages/clean-di/src/runtime.ts`
- **Dependencies:** T-026, T-027
- **Effort:** 10h
- **Parallel-safe with:** T-069, T-070, T-071, T-073
- **Notes:** The JSDoc back-fill is the lion's share of the work — actual typedoc config is small.

### T-073 Polish — link all docs together; add contribution guide

- **Wave:** W6
- **Description:** Cross-link `doc/README.md`, `GETTING_STARTED.md`, `MIGRATION.md`, `DESIGN.md`, `BACKLOG.md` (this file), `api/`. Add a simple `CONTRIBUTING.md` covering how to run the repo locally, how to add fixtures, how to bump the generator version. Add a `CODE_OF_CONDUCT.md` (Contributor Covenant text).
- **Acceptance criteria:**
  - Every doc has a "see also" footer.
  - CONTRIBUTING covers fixture authoring and version-bump.
  - GitHub sees the COC and CONTRIBUTING.
- **Files affected:** `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, footers in each doc/\*.md
- **Dependencies:** T-069, T-070, T-071, T-072
- **Effort:** 6h
- **Parallel-safe with:** none in W6 (sequenced last)
- **Notes:** Light editorial work; mostly link wiring.

### T-074 Add per-example unit/integration tests

- **Wave:** W6
- **Description:** Each example gets a small Vitest test that imports the example's index.ts and asserts the documented behaviour. E.g. for `basic`, assert the greeter outputs "Hello, X"; for `modular`, assert the Calculator returns the right sum; for `full-blog-app`, assert the mocked HTTP-driven `listPosts` returns the seeded posts and lifecycle logs fire in the right order.
- **Acceptance criteria:**
  - Three test files, one per example.
  - All pass in CI.
- **Files affected:** `examples/basic/test/example.test.ts`, `examples/modular/test/example.test.ts`, `examples/full-blog-app/test/example.test.ts`
- **Dependencies:** T-065, T-066, T-067
- **Effort:** 8h
- **Parallel-safe with:** T-069..T-073 (different folders)
- **Notes:** These tests both validate the examples and catch regressions in `clean-di` itself.

### T-075 Coverage configuration + report upload

- **Wave:** W6
- **Description:** Wire `vitest --coverage` to produce LCOV. Add a CI step to upload coverage to Codecov (or GitHub Actions artifact if Codecov is undesired). Enforce thresholds: 100% lines for `packages/clean-di` (small, fully testable surface — DESIGN §10.1), 85% for `packages/clean-di-codegen`.
- **Acceptance criteria:**
  - Coverage thresholds enforced in `vitest.config.ts`.
  - CI uploads artifact / Codecov report.
  - Failure to meet threshold fails CI.
- **Files affected:** `vitest.config.ts`, `packages/clean-di/vitest.config.ts`, `packages/clean-di-codegen/vitest.config.ts`, `.github/workflows/ci.yml`
- **Dependencies:** T-015, T-068
- **Effort:** 6h
- **Parallel-safe with:** T-069..T-074
- **Notes:** DESIGN §10.1 specifies 100% for the runtime.

### T-076 Add a smoke test for the published `bin`

- **Wave:** W6
- **Description:** A CI job that does `pnpm pack` on both packages, installs them into a temp directory matching one of the examples, runs `npx clean-di-codegen --check`, asserts exit 0. Catches packaging regressions (missing files, wrong `exports`, bad `bin` path).
- **Acceptance criteria:**
  - CI job present and green.
  - Catches a deliberately broken `exports` map in a test branch.
- **Files affected:** `.github/workflows/ci.yml` (add `packaging-smoke` job)
- **Dependencies:** T-064, T-068
- **Effort:** 6h
- **Parallel-safe with:** T-069..T-075
- **Notes:** Quick check; high value before any publish.

---

## W7 — Release prep

### T-077 Adopt Changesets for versioning

- **Wave:** W7
- **Description:** Install `@changesets/cli`, initialise (`changeset init`), configure to publish under the npm org (TBD — placeholder name). Add a `CONTRIBUTING.md` section explaining how to add a changeset. Add a CI job that fails a PR if it touches `packages/*/src` but has no changeset.
- **Acceptance criteria:**
  - `pnpm changeset` works.
  - Missing-changeset CI guard active.
  - `pnpm changeset version` correctly bumps both packages and updates the lockfile.
- **Files affected:** `.changeset/config.json`, `.changeset/README.md`, `CONTRIBUTING.md` (extend), `.github/workflows/ci.yml` (add changeset-guard step), root `package.json` (add devDep)
- **Dependencies:** T-073
- **Effort:** 8h
- **Parallel-safe with:** T-078, T-079
- **Notes:** DESIGN §9.2 — semver discipline, generator format hash tracks majors.

### T-078 Document version-bump policy

- **Wave:** W7
- **Description:** Extend `CONTRIBUTING.md` with the version-bump rules from DESIGN §9.2: majors require regenerating all `.di.generated.ts` files (and bumping the generator version embedded in each header); minors are output-compatible; patches are bugfix-only. Provide a checklist for releasers.
- **Acceptance criteria:**
  - Section in CONTRIBUTING.
  - Linked from the release workflow.
  - Checklist actionable.
- **Files affected:** `CONTRIBUTING.md` (extend)
- **Dependencies:** T-077
- **Effort:** 4h
- **Parallel-safe with:** T-079, T-080, T-081
- **Notes:** None.

### T-079 npm publish workflow

- **Wave:** W7
- **Description:** Add `.github/workflows/release.yml` that triggers on tag `v*`, runs the full CI, then `pnpm -r publish --access public` using a stored `NPM_TOKEN` secret. Optionally use Changesets' publish action (`changesets/action`) — cleaner.
- **Acceptance criteria:**
  - Workflow exists, validated with `actionlint`.
  - Dry-run (`pnpm publish --dry-run` step in CI) succeeds on a release-candidate branch.
  - `provenance: true` flag set per npm best practices.
- **Files affected:** `.github/workflows/release.yml`
- **Dependencies:** T-077
- **Effort:** 10h
- **Parallel-safe with:** T-078, T-080, T-081
- **Notes:** Don't actually publish until T-081 fires.

### T-080 Final API freeze checklist

- **Wave:** W7
- **Description:** Author a one-page checklist in `doc/API_FREEZE.md` listing every export from `clean-di` (`defineContext`, `defineConfig`, `provide`, `bean`, `Container`, `BeanDef`, `ContextSpec`, `ConfigSpec`, `createContext`, `BuildResult`) with their final v1 signatures pinned. Each item has a checkbox: "reviewed; no breaking changes intended for v1.x". Cross-check against DESIGN §6.4's "max 9 named exports" claim.
- **Acceptance criteria:**
  - All 9 (or 10 counting `BuildResult` from the runtime entry) signatures documented.
  - Checklist signed off by maintainer before T-081.
- **Files affected:** `doc/API_FREEZE.md`
- **Dependencies:** T-026, T-027
- **Effort:** 6h
- **Parallel-safe with:** T-077, T-078, T-079, T-081
- **Notes:** A snapshot-style record so future drift is easy to spot.

### T-081 Cut v1.0.0 tag

- **Wave:** W7
- **Description:** Run `pnpm changeset version` to roll the changesets into a `1.0.0` bump for both packages. Update CHANGELOGs. Verify CI is green. Tag the commit `v1.0.0`. Push the tag. Let the release workflow (T-079) publish to npm. Verify both packages appear on the registry. Update `doc/README.md` install commands to drop the `next` tag if any.
- **Acceptance criteria:**
  - `clean-di@1.0.0` and `clean-di-codegen@1.0.0` published.
  - Tag `v1.0.0` on GitHub.
  - Release notes published.
- **Files affected:** CHANGELOGs (auto-generated), `package.json` versions (auto-bumped), `doc/README.md` (install command update)
- **Dependencies:** T-077, T-078, T-079, T-080
- **Effort:** 18h
- **Parallel-safe with:** none — this is the terminal task
- **Notes:** Effort is generous to account for the inevitable last-minute fix-up cycle. DESIGN §11 v1.0.

---

_End of backlog._
