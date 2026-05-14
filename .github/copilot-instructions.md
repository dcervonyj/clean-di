# clean-di — Copilot Instructions

## Build, test, and lint commands

```bash
pnpm test                        # full suite (Vitest, both packages)
pnpm tracer                      # runtime smoke test only (~240 ms) — "is the lib working?"
pnpm exec vitest run defineContext --reporter=verbose  # single test file
pnpm typecheck                   # strict NodeNext check on both packages
pnpm lint                        # ESLint --max-warnings 0
pnpm format                      # Prettier auto-fix
pnpm format:check                # Prettier check-only (used in CI)
pnpm build                       # tsc -b both packages
pnpm clean                       # remove dist/, *.tsbuildinfo, coverage/
```

`pnpm test` uses Vitest workspace mode (`vitest.workspace.ts`) across both packages. Run from the repo root unless targeting a specific package.

## Architecture overview

This is a pnpm-workspaces monorepo with two publishable packages:

- **`packages/clean-di`** — the runtime library (W2 complete)
- **`packages/clean-di-codegen`** — the codegen CLI (W3+ in progress)

### End-to-end data flow

```
Author writes:          Codegen reads:                 Generated file:              Runtime executes:
src/X.di.ts         →  TypeScript compiler API    →   src/X.di.generated.ts    →  createContext({...})
  defineContext({        - parses .di.ts                 createContext<Cfg, Exp>(    - Map<key, instance>
    beans: {             - resolves constructor types     (cfg) => {                 - postConstruct
      a: bean(A),        - topo-sorts the dependency       const a = new A();        - preDestroy
      b: bean(B),          graph                           const b = new B(a);       - CDIE-101..104
    },                   - emits explicit new() calls      return { bag, expose };
    expose: ["b"],                                        });
  })
```

Domain classes (`A`, `B`) are **plain TypeScript — zero DI imports**. This is the central design constraint.

### Dual entry-point split

`packages/clean-di` exports two paths:

| Import path | Used by | Contents |
|---|---|---|
| `clean-di` | Author `.di.ts` files | `defineContext`, `defineConfig`, `provide`, `bean` + types |
| `clean-di/runtime` | Generated `.di.generated.ts` files only | `createContext` |

Never import `clean-di/runtime` from author-written code.

### Key files to understand the library

| File | Why |
|---|---|
| `packages/clean-di/src/public/types.ts` | Branded `BeanDef<T>` type vocabulary everything else builds on |
| `packages/clean-di/src/runtime/createContext.ts` | The ~70-line runtime engine: caching, lifecycle, CDIE error codes |
| `packages/clean-di/test/fixtures/runtime-tracer/SampleContext.di.generated.ts` | The canonical example of what codegen emits; what the runtime consumes |
| `packages/clean-di/src/public/defineContext.ts` | Curried generics + fail-loud guard (throws until codegen runs) |
| `packages/clean-di-codegen/src/analyzer/` | TypeScript compiler API–based analyzers (W3 work) |

### `defineContext` is a fail-loud placeholder until codegen runs

`defineContext()({...})` returns a marker that **throws on `.get()` / `.destroy()` / `.destroyAll()`** with a message instructing to run `clean-di-codegen`. The `.di.generated.ts` file shadows this with a real `createContext(...)` result. This is intentional — authors get typed `Container` references in their editor before codegen runs.

## Key conventions

### TypeScript strictness (inherited by all packages via `tsconfig.base.json`)

- **`module: "NodeNext"`** — relative imports require explicit `.js` extensions (`./foo.js`, not `./foo`)
- **`verbatimModuleSyntax: true`** — use `export type` / `import type` for type-only re-exports
- **`exactOptionalPropertyTypes: true`** — `prop?: T` and `prop?: T | undefined` are distinct
- **`noUncheckedIndexedAccess: true`** — `arr[i]` returns `T | undefined`, handle it
- No decorators anywhere — it's the library's core design constraint

### Generated files

- `.di.generated.ts` files are **committed to git**, never gitignored
- They are excluded from ESLint (`**/*.di.generated.ts`) and Prettier (`.prettierignore`)
- The fixture at `packages/clean-di/test/fixtures/runtime-tracer/SampleContext.di.generated.ts` is hand-written but in the exact shape the codegen will emit

### Commits and branching

- All git commits must be authored as `dcervonyj <dcervonyj@gmail.com>` — configure with `git config user.name "dcervonyj" && git config user.email "dcervonyj@gmail.com"` or pass `--author` per commit
- Commit format: `T-NNN <imperative verb> <object>` (e.g., `T-017 add shared public types`)
- No AI attribution in commit messages or author fields
- Integration/post-merge fixes use conventional prefixes: `fix(W2): …`, `chore: …`
- Each task gets its own branch named after its task ID (`t-017`, `t-024`, etc.)

### ESLint rules worth noting

- `@typescript-eslint/no-explicit-any`: error
- `@typescript-eslint/consistent-type-imports`: error (enforces `import type`)
- `unused-imports/no-unused-imports`: error
- `import/order` with alphabetized groups and newlines between groups

### Prettier config (`.prettierrc`)

100 columns, semicolons, double quotes, trailing comma `all`.

### Error code catalog

Runtime errors are named `CDIE-NNN` (defined in `createContext.ts`):
- `CDIE-101` — `get()` called after `destroy()`
- `CDIE-102` — `destroy()` called for unknown key (warns, doesn't throw)
- `CDIE-103` — `postConstruct` threw
- `CDIE-104` — `preDestroy` error(s) during teardown (wrapped in `AggregateError`)

Codegen diagnostic codes `CDI-001`..`CDI-010` are defined in `doc/DESIGN.md §8` (W3/W4 work).

## Project status

- **W1** (monorepo tooling) — complete
- **W2** (runtime + DSL) — complete; `packages/clean-di` is fully working
- **W3** (codegen MVP) — in progress; `packages/clean-di-codegen/src/` being filled
- **W4–W7** — not started; see `doc/BACKLOG.md` for the full 78-task list

The `pnpm tracer` command runs the 8 integration tests that serve as the authoritative "does the runtime work?" check.
