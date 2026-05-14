# clean-di — Repository Guide

> A practical map of the repo for anyone (human or agent) who needs to find their way around quickly. Companion documents:
>
> - [`DESIGN.md`](./DESIGN.md) — the architectural spec
> - [`BACKLOG.md`](./BACKLOG.md) — the 78-task implementation backlog

---

## 1. How to verify the lib works (current state: W2 complete)

Four tiers, from quickest to deepest.

### Tier 1 — does the toolchain work? (~10 s)

```bash
cd <repo-root>
pnpm install        # should be "Already up to date" on subsequent runs
pnpm typecheck      # both packages report: "Done"
pnpm test           # 8 files, 41 tests pass
```

**Pass criteria:** every command exits 0; `pnpm test` shows `Tests  41 passed (41)`.

### Tier 2 — does the runtime work end-to-end? (~5 s)

```bash
pnpm tracer
```

Runs only `packages/clean-di/test/runtime/runtimeTracer.test.ts` — 8 integration tests against a hand-written `.di.generated.ts` fixture. Exercises `get`, idempotency, scoping by key, `postConstruct`, `preDestroy` via `destroy`, CDIE-101 (get-after-destroy), `destroyAll`, and end-to-end build/use/teardown.

If this passes, the runtime is correct. The fixture at

```
packages/clean-di/test/fixtures/runtime-tracer/SampleContext.di.generated.ts
```

is hand-written but in exactly the shape codegen will emit in W3+. Read it to see what generated files look like.

### Tier 3 — does the lib actually satisfy its design constraints? (~5 min, manual)

These checks confirm the _design_ is what was promised, not just that code compiles.

```bash
# 3.1 — zero DI footprint in domain code (the central design constraint)
grep -n 'clean-di' packages/clean-di/test/fixtures/runtime-tracer/SampleContext.di.generated.ts
#   → only ONE match: the `import { createContext } from "..."` line in the GENERATED file.
#     The Logger / Counter / Greeter domain classes are pristine.

# 3.2 — zero decorators anywhere in src/
grep -rn '@[A-Z][a-zA-Z]*(' packages/clean-di/src
#   → no output

# 3.3 — author-facing API is exactly 4 values + 4 types
cat packages/clean-di/src/index.ts
#   → defineContext, defineConfig, provide, bean + types Container, BeanDef, ContextSpec, ConfigSpec

# 3.4 — runtime is small (DESIGN goal §2.1.11: sub-300 lines)
wc -l packages/clean-di/src/runtime/*.ts
#   → expect well under 300 total

# 3.5 — fail-loud guard exists for pre-codegen Container usage
pnpm exec vitest run defineContext --reporter=verbose
#   → 5 tests including "get() throws with regenerate-codegen message"

# 3.6 — type-level safety
cat packages/clean-di/test/types/dsl.test-d.ts
#   → 4 expectTypeOf assertions: TBeans inference, get-overload conditional, ExposedOf narrowing
```

### Tier 4 — read the git history (~10 min)

```bash
git log --oneline --graph master
```

You'll see the wave structure:

| Commit                         | What                                                                     |
| ------------------------------ | ------------------------------------------------------------------------ |
| `W1 foundation complete`       | 9 task branches octopus-merged                                           |
| `W2A type foundations`         | 3 type-foundation branches merged                                        |
| `W2B DSL + createContext`      | 5 DSL/runtime branches merged                                            |
| `W2C entries + runtime tracer` | 3 entry/tracer branches merged                                           |
| `W2D type-level tests`         | 1 type-level test branch merged                                          |
| `fix(W2): …` × 7               | integration fixes after running `pnpm typecheck` against the merged tree |

Each `T-NNN` commit is a single task with a clear scope; every wave merge is a `--no-ff` commit that names the tasks it consolidates.

---

## 2. Top-level layout

```
clean-di/
├── doc/                       # Design, backlog, and this guide
│   ├── DESIGN.md
│   ├── BACKLOG.md
│   └── REPO_GUIDE.md          # this file
│
├── packages/
│   ├── clean-di/              # ← W2 complete: runtime + DSL + entries + tests
│   └── clean-di-codegen/      # ← W1 scaffolded only: src/ and test/ empty (W3 fills)
│
├── package.json               # workspace root: scripts, devDeps, packageManager pin
├── pnpm-workspace.yaml        # packages/* + examples/*
├── pnpm-lock.yaml             # committed (CI uses --frozen-lockfile)
├── tsconfig.base.json         # strict NodeNext settings inherited by both packages
├── vitest.workspace.ts        # vitest workspace mode (deprecation noted — fine for now)
│
├── .eslintrc.cjs              # ESLint 8 with TS / import / unused-imports plugins
├── .eslintignore
├── .prettierrc                # 100 cols, semi, double-quote, trailing comma all
├── .prettierignore            # excludes *.di.generated.ts
├── .editorconfig
├── .gitignore                 # IMPORTANT: does NOT ignore *.di.generated.ts (committed intentionally)
│
├── .github/workflows/ci.yml   # Node 20 + 22 matrix; lint + typecheck + test + build
├── LICENSE                    # MIT
└── README.md                  # Repo landing stub (W6 rewrites with real examples)
```

---

## 3. `packages/clean-di/` — the runtime package

```
src/
├── index.ts                   # PUBLIC ENTRY — exactly 4 values + 4 types, no wildcards
├── runtime.ts                 # SECONDARY ENTRY — used by .di.generated.ts files only
├── public/                    # Author-facing DSL primitives
│   ├── types.ts               # BeanDef brand, Beans, ContextSpec, ConfigSpec, ExposedOf
│   ├── bean.ts                # bean(Class, overrides?) — codegen marker
│   ├── provide.ts             # provide(factory) — explicit factory binding
│   ├── defineConfig.ts        # defineConfig({...}) — modular sub-config + DefinedConfig brand
│   └── defineContext.ts       # defineContext<TConfig>()({...}) — curried, fail-loud guard
└── runtime/                   # The engine that generated files import
    ├── Container.ts           # Container<TConfig, TExposed> interface + CachedInstance
    ├── buildResult.ts         # BuildResult<TExposed> interface
    └── createContext.ts       # ~70 lines — caching, lifecycle, CDIE-101..104

test/
├── fixtures/runtime-tracer/
│   └── SampleContext.di.generated.ts   # ← THE "is it working?" artifact
├── public/                    # Unit tests for each DSL primitive
│   ├── bean.test.ts
│   ├── provide.test.ts
│   ├── defineConfig.test.ts
│   ├── defineContext.test.ts
│   └── api-surface.test.ts    # exact-export guard for index.ts
├── runtime/
│   ├── createContext.test.ts  # 13 tests covering every Container behavior
│   └── runtimeTracer.test.ts  # 8 end-to-end integration tests
└── types/
    └── dsl.test-d.ts          # 4 type-level assertions via expect-type
```

### Files most worth reading to understand the lib

| Order | File                                                         | Why                                                       |
| ----- | ------------------------------------------------------------ | --------------------------------------------------------- |
| 1     | `src/public/types.ts`                                        | The branded type vocabulary every other file builds on    |
| 2     | `src/runtime/createContext.ts`                               | The actual engine — ~70 readable lines                    |
| 3     | `test/fixtures/runtime-tracer/SampleContext.di.generated.ts` | What codegen output looks like; what the runtime consumes |
| 4     | `src/public/defineContext.ts`                                | The subtlest file: curried generics + fail-loud guard     |
| 5     | `test/runtime/runtimeTracer.test.ts`                         | Worked example of using the runtime end-to-end            |

### Dual exports map

`packages/clean-di/package.json` defines two entry points:

```json
"exports": {
  ".": "./dist/index.js",            // public DSL for authors
  "./runtime": "./dist/runtime.js"   // engine for generated files
}
```

- **`import { defineContext, bean, provide } from "clean-di"`** — what you write in `.di.ts` files.
- **`import { createContext } from "clean-di/runtime"`** — what generated `.di.generated.ts` files import.

Splitting the two keeps the author-facing API surface minimal (DESIGN §6.4).

---

## 4. `packages/clean-di-codegen/` — empty shell (W3 fills it)

```
packages/clean-di-codegen/
├── package.json               # bin entry, peer dep on typescript >=5
├── tsconfig.json              # composite, references ../clean-di
├── vitest.config.ts           # 85% coverage threshold (lower than runtime — bigger surface)
├── src/                       # EMPTY
└── test/                      # EMPTY
```

Runtime deps named in DESIGN §9.3: `chokidar`, `picocolors`, `mri`, peer `typescript`.

W3 lands `src/{cli,analyzer,emitter,diagnostics,config}/*.ts` per the BACKLOG.

---

## 5. Data flow (end-to-end)

```
Author hand-writes:              Codegen (W3+) reads:           Generated file:                Runtime executes:

src/X.di.ts                  →   TS compiler API           →    src/X.di.generated.ts      →   createContext({...})
  defineContext({                 - parses .di.ts                createContext<Cfg, Exp>(        - Map<key, instance>
    beans: {                      - finds bean(Class) calls       (cfg) => {                    - postConstruct
      a: bean(A),                 - resolves constructor types     const a = new A();           - preDestroy
      b: bean(B),                 - topo-sorts the graph           const b = new B(a);          - CDIE-101..104
    },                            - emits explicit new()           return { bag, expose };
    expose: ["b"],                                                });
  })

(domain classes A, B —
 plain TS, zero DI imports)
```

- **W1** produced the empty packages.
- **W2** produced the rightmost two columns (runtime + DSL + hand-written tracer fixture).
- **W3 onwards** produces the codegen middle column.

---

## 6. Scripts you'll actually use

| Command             | Purpose                                                 | Wall time |
| ------------------- | ------------------------------------------------------- | --------- |
| `pnpm tracer`       | Runtime smoke — the "is the lib working?" answer        | ~240 ms   |
| `pnpm test`         | Full suite (41 tests)                                   | ~370 ms   |
| `pnpm typecheck`    | Strict NodeNext check on both packages                  | ~3 s      |
| `pnpm install`      | Hydrate `node_modules` from lockfile                    | ~5 s warm |
| `pnpm lint`         | ESLint with import + unused-imports rules               | ~5 s      |
| `pnpm format`       | Prettier auto-fix                                       | ~2 s      |
| `pnpm format:check` | Prettier check-only (used in CI)                        | ~2 s      |
| `pnpm build`        | `tsc -b` both packages (no-op until W7 wires the build) | ~2 s      |
| `pnpm clean`        | Remove `dist/`, `*.tsbuildinfo`, `coverage/`            | instant   |

---

## 7. What's NOT in the lib yet (intentional, scheduled)

| Capability                                                                        | Wave    | Status               |
| --------------------------------------------------------------------------------- | ------- | -------------------- |
| Codegen analyzer (parseDiFile, buildBeanScope, resolveConstructor, topoSort)      | W3      | not started          |
| Codegen emitter (formatGenerated, hash) + diagnostic codes CDI-001..010           | W3 / W4 | not started          |
| Modular composition (`imports: [...]`), overrides, lifecycle wiring               | W4      | not started          |
| `--watch` / `--check` CLI modes                                                   | W5      | not started          |
| Example projects (`examples/basic`, `examples/modular`, `examples/full-blog-app`) | W6      | not started          |
| User-facing README, GETTING_STARTED.md, MIGRATION.md                              | W6      | stubs only           |
| Changesets + publish workflow + v1.0.0 tag                                        | W7      | not started          |
| React adapter (`clean-di-react`)                                                  | post-v1 | out of scope for now |

---

## 8. Known minor issues (none blocking)

- **Vitest workspace deprecation** — `vitest.workspace.ts` should migrate to `test.projects` in a root config file before Vitest v4. Today's warning is benign.
- **ESLint 8 is end-of-life** — works fine but a migration to ESLint 9 + flat config will eventually be needed. The BACKLOG specifies `.eslintrc.cjs` (legacy format), so ESLint 8.x was the correct choice for now.
- **Six transitive deprecation warnings** from pnpm install (`@humanwhocodes/*`, `glob@10/7`, `inflight`, `rimraf@3`) — all under ESLint 8's dependency tree; will clear with the ESLint upgrade.

---

## 9. Conventions worth knowing

### Branching and worktrees

- Every task gets its own branch named after its task ID (`t-017`, `t-024`, etc.).
- Branches are created in worktrees under `../worktrees/clean-di-<task-id>/` so multiple tasks can run in parallel without stepping on each other.
- Each wave finishes with an octopus `--no-ff` merge naming all tasks in its message.

### Commits

- Format: `T-NNN <imperative verb> <object>` (e.g., `T-017 add shared public types`).
- No AI attribution in commit messages or author fields (per project policy).
- Integration fixes (post-merge) use conventional prefixes: `fix(W2): …`, `chore: …`.

### Code style

- Strict NodeNext — relative imports require explicit `.js` extension.
- `verbatimModuleSyntax: true` — must use `export type` for type-only re-exports.
- `exactOptionalPropertyTypes: true` — `?` and `| undefined` are distinct.
- `noUncheckedIndexedAccess: true` — `arr[i]` returns `T | undefined`.
- No decorators anywhere (it's the lib's whole point).
- Prettier-formatted (100 cols, double-quote, trailing comma all).

### Generated files

- `.di.generated.ts` files are **committed**, never gitignored.
- They are excluded from ESLint and Prettier (the codegen produces its own format).
- W3+ adds `clean-di-codegen --check` to CI to verify generated files are up to date.

---

## 10. Quick navigation cheat sheet

| Looking for…                          | Go to                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| Why is the lib designed this way?     | `doc/DESIGN.md` §1–3                                                           |
| The task list / what's left           | `doc/BACKLOG.md`                                                               |
| The public types                      | `packages/clean-di/src/public/types.ts`                                        |
| The runtime engine                    | `packages/clean-di/src/runtime/createContext.ts`                               |
| What a generated file looks like      | `packages/clean-di/test/fixtures/runtime-tracer/SampleContext.di.generated.ts` |
| How to use the lib end-to-end         | `packages/clean-di/test/runtime/runtimeTracer.test.ts`                         |
| Error code catalog                    | `doc/DESIGN.md` §8                                                             |
| The codegen algorithm (when it lands) | `packages/clean-di-codegen/src/analyzer/`                                      |

---

_End of guide._
