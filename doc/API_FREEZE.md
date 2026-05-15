# API Freeze — Public Surface for v1.0.0

This document records the public API that is locked for v1.0.0. Any change to a symbol listed here requires a semver bump per [VERSIONING.md](./VERSIONING.md).

---

## `clean-di` — runtime package

### Exported functions

| Symbol          | Signature                                                                                 | Notes                                 |
| --------------- | ----------------------------------------------------------------------------------------- | ------------------------------------- |
| `defineContext` | `<Cfg>() => (def: ContextDef<Cfg>) => ContextDeclaration<Cfg>`                            | Curried; outer call fixes config type |
| `defineConfig`  | `<Cfg>(def: SubConfigDef<Cfg>) => SubConfigDeclaration<Cfg>`                              | For sub-context imports               |
| `bean`          | `<C extends Constructor>(Class: C, overrides?: Overrides<C>) => BeanDef<InstanceType<C>>` | Declares a bean                       |
| `provide`       | `<T>(factory: (cfg: any) => T) => T`                                                      | Provides a value derived from config  |
| `createContext` | Generated per context — not exported from the runtime                                     | Emitted by codegen                    |

### Exported types

| Symbol              | Notes                                                      |
| ------------------- | ---------------------------------------------------------- | ------------ |
| `ContextDef<Cfg>`   | Shape of the object passed to `defineContext()()`          |
| `BeanDef<T>`        | Opaque branded type returned by `bean()`                   |
| `Container<Expose>` | Runtime container type; `Expose` is inferred from `expose` |
| `Lifecycle`         | `{ postConstruct?: () => void; preDestroy?: () => void }`  |
| `Scope`             | `"singleton"                                               | "prototype"` |

### Stability guarantees

- All symbols above are `public` for semver purposes.
- Internal modules (`src/internal/`, `src/analyzer/`) are **not** part of the public API even if importable. Do not document or test them as stable.

---

## `clean-di-codegen` — CLI package

### CLI flags

| Flag           | Description                                                   |
| -------------- | ------------------------------------------------------------- |
| `--root <dir>` | Directory to search for `.di.ts` files (default: `.`)         |
| `--check`      | Verify generated files are up to date; exit non-zero if stale |
| `--watch`      | Re-run on file changes (planned, not yet in v1.0.0)           |

### Programmatic API

```ts
import { runCodegen } from "clean-di-codegen";

await runCodegen({ root: "./src", check: false });
```

| Export           | Signature                                          | Notes            |
| ---------------- | -------------------------------------------------- | ---------------- |
| `runCodegen`     | `(opts: CodegenOptions) => Promise<CodegenResult>` | Main entry point |
| `CodegenOptions` | `{ root: string; check?: boolean }`                | Input options    |
| `CodegenResult`  | `{ wrote: string[]; errors: Diagnostic[] }`        | Output           |

### Generated-file format

The emitted `*.di.generated.ts` file exports a single `createContext` function. Its exact shape is part of the public API; changes require a **major** bump (see VERSIONING.md §generated-file-format-stability).

---

## Pre-release checklist (v1.0.0)

- [ ] `pnpm typecheck` passes (both packages)
- [ ] `pnpm lint` passes (both packages)
- [ ] `pnpm test` — 259/259 passing
- [ ] `pnpm test:coverage` — thresholds met (100 % `clean-di`; 85 % `clean-di-codegen`)
- [ ] All examples build and pass `check:codegen`
- [ ] `scripts/smoke-test.sh` exits 0
- [ ] Changeset created for both packages (`pnpm changeset`)
- [ ] `pnpm changeset version` applied; `CHANGELOG.md` files look correct
- [ ] `v1.0.0` git tag pushed
- [ ] GitHub release created from tag
- [ ] npm packages published (`pnpm changeset publish`)
