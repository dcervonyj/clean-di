# Contributing to clean-di

Thank you for your interest in contributing!

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 (`npm install -g pnpm`)

## Setup

```bash
git clone https://github.com/dcervonyj/clean-di.git
cd clean-di
pnpm install
```

## Development workflow

```bash
pnpm typecheck   # typecheck all packages
pnpm lint        # ESLint across all packages
pnpm test        # run all tests
pnpm build       # build all packages
```

Generated files (`*.di.generated.ts`) are committed to the repository — run the examples' `check:codegen` scripts to verify they are up to date:

```bash
pnpm --filter './examples/*' check:codegen
```

## Pull requests

1. Fork the repo and create a branch from `master`.
2. Keep changes focused — one feature or fix per PR.
3. All tests must pass (`pnpm test`).
4. Both packages must typecheck (`pnpm typecheck`).
5. Add a changeset describing your change:
   ```bash
   pnpm changeset
   ```
   See [doc/VERSIONING.md](./doc/VERSIONING.md) for the versioning policy.

## Code style

- TypeScript strict mode — no `any`, no `as` assertions unless unavoidable.
- No decorators on domain classes — that's the whole point.
- All relative imports inside `packages/` need an explicit `.js` extension (NodeNext module resolution).
- ESLint is configured to catch most style issues; run `pnpm lint` before submitting.

## Commit format

```
<type>(T-NNN): <short imperative description>
```

Examples: `feat(T-082): add watch-mode CLI flag`, `fix(T-083): resolve config beans in emitter`.

## Reporting bugs

Open a GitHub issue with a minimal reproduction (ideally a `.di.ts` snippet that triggers the wrong behaviour).

## Code of Conduct

Be respectful and constructive. Harassment or exclusionary behaviour of any kind is not welcome.
