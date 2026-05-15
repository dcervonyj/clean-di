# clean-di — Session Handoff Notes

> Captures decisions, conventions, and footguns from the build sessions that didn't make it into [DESIGN.md](./DESIGN.md), [BACKLOG.md](./BACKLOG.md), or [REPO_GUIDE.md](./REPO_GUIDE.md). Read this before continuing work in a new session.

---

## 1. The trilemma — and why codegen

The library is built around a hard constraint set:

1. **No decorators anywhere** — not on domain classes, not on config classes, nothing.
2. **No DI-library references in domain code** — `application/`, `api/`, `repository/`, `presentation/`, `ui/` layers cannot import from `clean-di`.
3. **Type-driven auto-wiring** — domain classes should not need `static $inject` arrays, marker interfaces, or any DI footprint.

Any two of those three are achievable with off-the-shelf libraries. **All three at once require either a TypeScript transformer or build-time codegen.** That's not negotiable — it's a structural limit of TypeScript's erased-types runtime.

### Why codegen, not transformer

Transformer approaches (Clawject, `@wessberg/DI-compiler`) deliver the same ergonomics but couple the build pipeline to `ts-patch` or a custom compiler hook. Every TypeScript upgrade is a maintenance event; `ts-patch` itself patches `tsc` and must be re-applied. Codegen produces committed `.di.generated.ts` files that any standard TypeScript pipeline can consume unmodified.

### Rejected alternatives (explicitly considered, deliberately not chosen)

| Alternative                                                                  | Why rejected                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Brandi** (typed tokens, explicit `bind().toInstance()` factories)          | No auto-wiring. Solves merge-conflict half of the problem but not the boilerplate half — every bean still needs hand-written constructor arguments.                                                                                                                                                           |
| **Awilix CLASSIC** (`static inject = [...]` arrays on classes)               | Puts a small DI footprint in domain code. Violates constraint #2 in spirit even though it's not a decorator.                                                                                                                                                                                                  |
| **Awilix PROXY** (parameter-name-based auto-wiring)                          | Survives minification only with `keep_fnames: true`; names aren't type-checked. Brittle.                                                                                                                                                                                                                      |
| **Modular plain factories** (a `subFactory` primitive over hand-rolled DSLs) | Solves only the merge-conflict surface, not the per-bean boilerplate. Each bean still requires a `new X(a, b, c)` line.                                                                                                                                                                                       |
| **Convention-based runtime DI** (sidecar `.di-meta.ts` with `static $deps`)  | Lightweight and elegant, but identity is name-based (string keys), not type-based. A rename silently breaks wiring without a compile-time error.                                                                                                                                                              |
| **Clawject**                                                                 | An off-the-shelf option that matches the constraints exactly (decorator-free in domain code; decorators only on config classes; type-driven via TS transformer; Spring-bean ergonomics). Excluded from consideration for project-external reasons. Worth knowing exists, in case the constraint ever relaxes. |

### Qualifier strategy

When type matching is ambiguous (two beans of the same type), DESIGN §7.5 specifies **type-match-first, parameter-name fallback, explicit overrides as escape hatch**. This was a deliberate choice over two alternatives:

- _Pure type-only with branded types per bean_ — too invasive on domain models.
- _Pure overrides-required-when-ambiguous_ — verbose; forces user to spell out the unambiguous-by-name case.

The chosen order is documented in `resolveOneParam.ts`'s top-of-file comment.

---

## 2. Hard-won lessons (W3 / W4 integration footguns)

These bit me at least once during the build. Anyone touching the analyzer or fixtures will hit them.

### Test fixtures: stubs must be type-preserving

The `node_modules/clean-di` stubs in test fixtures **must** preserve the generic over `T`:

```ts
// WRONG — collapses every provide() to `any`, which matches every parameter type:
export function provide(...args: any[]): any {
  return args;
}

// RIGHT — preserves T at the call site:
export function provide<T>(factory: (cfg: any) => T): T {
  return undefined as any;
}
```

Same for `bean<C>(Class: C): InstanceType<C>`. The fixture-builder pattern in every test uses the right version; copy that pattern when adding new tests.

### Test fixtures: empty classes are structurally identical

`class Logger {}` and `class UseCase {}` are both `{}` at the type level — they match each other under `isTypeAssignableTo`. Every fixture class needs a nominally-distinguishing member:

```ts
class Logger {
  private readonly tag = "logger";
  log(): void {}
}
class UseCase {
  private readonly tag = "use-case";
  constructor(public logger: Logger) {}
}
```

Without `private readonly tag`, the type-matcher cannot tell `Logger` and `UseCase` apart, and every constructor parameter matches every bean.

### `provide()` return type comes from the call expression, not the lambda body

```ts
// Look at the WHOLE expression's type, not the lambda's return type.
// (Because if `cfg` is typed `any` — which it usually is in stubs — then
// `cfg.x` is `any`, and the lambda's return is `any`. But the call
// `provide<string>((cfg) => cfg.x)` is typed `string` due to the generic.)
const provideType = checker.getTypeAtLocation(call);
```

`buildBeanScope.ts` does this correctly; don't "improve" it by chasing the lambda's return type.

### `exactOptionalPropertyTypes: true` rejects `?: T` with explicit `undefined`

```ts
// WRONG under exactOptionalPropertyTypes:
interface X {
  readonly foo?: string;
}
const x: X = { foo: undefined }; // ERROR

// RIGHT:
interface X {
  readonly foo: string | undefined;
}
const x: X = { foo: undefined }; // OK
```

`BeanScopeEntry`, `ResolveParamInput.ownerEntry`, etc. all use the `: T | undefined` form for this reason. Don't switch them back to `?:` — every test that passes `undefined` explicitly will break.

### NodeNext imports need explicit `.js` suffix

```ts
// WRONG under module: NodeNext:
import { Foo } from "./Foo";

// RIGHT:
import { Foo } from "./Foo.js";
```

Yes, the source is `.ts` — the spec is module-system-aware, not file-extension-aware. Every relative import inside `packages/clean-di/src/` and `packages/clean-di-codegen/src/` uses `.js` (transitively, even for type-only imports). The eslint rule `consistent-type-imports` will flag mismatches; the `tsc --noEmit` typecheck will reject missing suffixes.

### Brand markers need `as unknown as BrandedType`

`BeanDef<T>` uses a `unique symbol` brand that has no constructible runtime value. The factory functions can't satisfy the brand directly:

```ts
// WRONG — fails under exactOptionalPropertyTypes:
const marker = { kind: "bean", Class, overrides } as BeanMarker<InstanceType<C>>;

// RIGHT:
const marker = { kind: "bean", Class, overrides } as unknown as BeanMarker<InstanceType<C>>;
```

This is the only sanctioned double-cast in the codebase. The brand is type-only by design.

### Picocolors disables colors in non-TTY environments

The `picocolors` default export auto-detects TTY at import time. In vitest (non-TTY), it ships uncolored output even when callers pass `isTty: true`. Use `createColors(true)` to force colors on:

```ts
import { createColors } from "picocolors";
const colors = createColors(true);
// colors.red("error") now actually emits ANSI red.
```

`diagnostics/report.ts` does this; the corresponding test asserts ANSI escape sequences are present.

### Test fixture generic invariance needs a phantom

To force TypeScript to treat `Repository<Post>` and `Repository<Comment>` as nominally different (the W4 type-rule test), the generic class needs a member that uses the type parameter:

```ts
class Repository<T> {
  private readonly _phantom?: T; // optional, no runtime cost, forces invariance
}
```

Without the `_phantom`, both instantiations collapse to `Repository<unknown>` structurally.

### `ContextDeclaration` shape changed mid-W4

W4 evolved `collectContexts`'s return shape from `readonly ContextDeclaration[]` to `{ contexts, diagnostics }`. Every caller of `collectContexts(parsed)` had to switch to `collectContexts(parsed).contexts[0]!`. Newer tests already use the right shape; if anything still uses `collectContexts(parsed)[0]!`, that's a leftover and will throw `.find is not a function` at runtime.

---

## 3. Conventions established but not yet documented in code

### Per-test fixture-builder helper

Every test that needs to parse a `.di.ts` source file uses the same pattern:

```ts
async function buildFixture(diSource: string): Promise<{ program; filePath; cleanup }> {
  // 1. Create a tmpdir
  // 2. Stub `node_modules/clean-di` with type-preserving exports
  // 3. Write the user's diSource to input.di.ts
  // 4. Build a ts.Program rooted at that file
  // 5. Return { program, filePath, cleanup }
}
```

This pattern appears in: `parseDiFile.test.ts`, `collectContexts.test.ts`, `buildBeanScope.test.ts`, `resolveOneParam.test.ts`, `resolveConstructor.test.ts`, `resolveOneParam.typeRules.test.ts`, `validateExpose.test.ts`. The shared version in `test/util/loadFixture.ts` (added by T-053) is the canonical implementation. New tests should use it.

### `expected-diagnostics.json` schema

Negative fixtures carry an `expected-diagnostics.json` next to `input.di.ts`. Two formats are in use:

```json
// Format A (bare array — cdi-005/008/009/051):
[{ "code": "CDI-005", "messageMatches": "missing curry" }]

// Format B (wrapped — cdi-004/006/007/010 + the three T-053 added):
{ "diagnostics": [{ "code": "CDI-006", "messageMatches": "DuplicateBean" }] }
```

`loadFixture.matchesExpected` accepts both (sniffs `Array.isArray`). When adding new negative fixtures, prefer Format B for consistency with the W4D additions; both forms are valid.

### Graceful-degradation pattern for analyzer errors

When the analyzer encounters a malformed context (CDI-005, CDI-009), it emits the diagnostic, **skips that context**, and continues with the rest of the file. This lets a single bad context not block emission for unrelated contexts. Don't change this to "fatal stop on first error" — the e2e test asserts the graceful-degradation behavior.

### Integration-fix commit pattern

Every sub-wave's merge is followed by 1–3 follow-up commits with the message prefix `fix(WnA): …` / `fix(WnB): …` / etc. These are the inevitable consequence of merging file-disjoint branches that each made consistent local assumptions but produced a tree that violates some cross-cutting invariant (typecheck error, test API rename, etc.). Don't try to push these fixes back into the per-task branches — by the time you discover them, those branches are merged and deleted.

---

## 4. Process knowledge — how the parallel build worked

### The worktree + sub-wave pattern

The codebase was built by orchestrating multiple AI agents in parallel. Each task gets its own git worktree under `../worktrees/clean-di-<task-id>/` and its own branch named after the task. Sub-waves group tasks that are file-disjoint and can run concurrently; the next sub-wave can't start until the current one merges.

Why sub-waves exist (and not "one big parallel fan-out for the whole project"): tasks within a sub-wave touch disjoint files. Tasks in different sub-waves may touch the same file in sequence (e.g., `resolveOneParam.ts` is extended by T-037 → T-043 → T-044 → T-054). Trying to merge those concurrently produces unresolvable conflicts.

The sub-wave structure for each wave is captured in BACKLOG.md, but the actual order-of-operations during execution was:

1. Read the next sub-wave's task list.
2. Create N worktrees from current `master`.
3. Spawn N agents in parallel, each in its own worktree.
4. Wait for all completions.
5. Octopus-merge if all files are disjoint; otherwise sequential `--no-ff` merges.
6. Run `pnpm install` if any task added a dependency.
7. Run `pnpm typecheck` and `pnpm test`. Fix integration issues directly on `master`.
8. Commit fixes with `fix(WnX): …`.
9. Move to next sub-wave.

### Octopus merge constraints

`git merge --no-ff branch1 branch2 branch3` works only when no two branches conflict. If any pair conflicts, git aborts the octopus and you must fall back to sequential merges with manual conflict resolution. The W4 merges hit this twice (T-043↔T-051 in `resolveConstructor.ts`, T-046↔T-052 in `collectContexts.ts`). Plan for sequential merges whenever multiple agents touched the same file.

### Order of sequential merges

When sequential merges are needed: **merge least-likely-to-conflict first**. Each subsequent merge resolves against an accumulating master state, so the last branch faces the most cross-cutting changes. In W4, the order was T-055 → T-051 → T-048 → T-043 → T-045 (most contested file last).

---

## 5. Current state (v1.0.0 — merged to master)

All waves W1–W8 are complete and merged. The project is at **v1.0.0** on `master`.

### Tests

- **282 passing / 282 total** across all workspace packages (`pnpm test`)
- Coverage: 100 % lines/functions/statements for `clean-di`; branch thresholds met for `clean-di-codegen`
- CI: all 4 jobs green (ci/20, ci/22, changeset-status, smoke-test)

### What's shipped

| Wave  | Scope                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| W1–W4 | Monorepo, runtime, DSL, full analyzer + emitter, diagnostic catalog (CDI-001–010)                                                            |
| W5    | CLI (`--watch`, `--check`, one-shot), programmatic API, args parsing                                                                         |
| W6    | Examples (`basic`, `modular`, `full-blog-app`), README, GETTING_STARTED, MIGRATION, TypeDoc                                                  |
| W7    | Changesets, npm publish workflow, `doc/VERSIONING.md`, `doc/API_FREEZE.md`, v1.0.0 tag                                                       |
| W8    | Watch-mode integration tests (T-083), multi-context emit per file (T-084), CLI subprocess tests (T-085), codegen→tsc roundtrip tests (T-086) |

### Open design questions — resolution status

1. **Lifecycle composition across imports** — ✅ implemented in `collectImportedLifecycleHooks` (see `emitGeneratedFile.ts`)
2. **Byte-for-byte snapshot comparison for positive fixtures** — ✅ done (all positive fixtures have `expected.di.generated.ts` checked in; e2e test uses `toMatchFileSnapshot`)
3. **Multi-context per file** — ✅ done in T-084 (`emitAllContexts` loop; `foo.<varName>.di.generated.ts` naming)
4. **Generic invariance fixtures** — open, low priority
5. **Synthetic config bean emission** — ✅ verified correct; covered by `config-bean-direct` fixture

### Known remaining issues (non-blocking)

- **Vitest workspace deprecation** — `vitest.workspace.ts` should migrate to root-config `test.projects` before Vitest v4.
- **ESLint 8 EOL** — eventual migration to ESLint 9 + flat config needed.
- **npm publish not yet run** — `release.yml` is wired; needs `NPM_TOKEN` secret set in repo settings to actually publish.
- **GitHub Actions Node 20 deprecation warning** — actions/checkout, setup-node, pnpm/action-setup will need updating before June 2026.

---

## 6. Repo / GitHub setup

- **Remote:** `https://github.com/dcervonyj/clean-di` (default branch `master`).
- **Active gh account:** `dcervonyj`.
- **License:** MIT.
- **CI:** `.github/workflows/ci.yml` — lint + typecheck + test + build + examples + coverage + smoke-test on Node 20 + 22.
- **Release:** `.github/workflows/release.yml` — `changesets/action@v1`; triggers on push to `master`; requires `NPM_TOKEN` secret.

---

_Cross-references: `doc/DESIGN.md` for the architectural spec, `doc/BACKLOG.md` for the full task list, `doc/REPO_GUIDE.md` for the repo map._
