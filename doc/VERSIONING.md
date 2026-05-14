# Versioning Policy

clean-di follows [Semantic Versioning 2.0.0](https://semver.org/).

## Version meaning

| Bump      | When                                                                                  |
| --------- | ------------------------------------------------------------------------------------- |
| **patch** | Bug fixes, documentation changes, internal refactors that do not touch the public API |
| **minor** | New backwards-compatible features added to the public API                             |
| **major** | Breaking changes to the public API or to the generated-file format                    |

## Compatibility matrix

| clean-di | clean-di-codegen | Node.js | TypeScript |
| -------- | ---------------- | ------- | ---------- |
| 1.x      | 1.x              | ≥ 20    | ≥ 5.0      |

Both packages are versioned in lockstep — a `clean-di@1.2.0` runtime requires `clean-di-codegen@1.2.0` (or any compatible 1.x patch). Mixing minor versions within the same major is not supported.

## Generated-file format stability

The `.di.generated.ts` format is part of the public API. A **major** bump is required whenever the shape of the emitted file changes in a way that would require users to re-run codegen or modify code that consumes the generated file.

When a major bump is released, all checked-in generated files across the monorepo's examples must be regenerated before the release commit:

```bash
pnpm --filter './examples/*' codegen
pnpm --filter './examples/*' check:codegen   # must pass
```

## How to record a change

Every user-facing change must be accompanied by a changeset. Run:

```bash
pnpm changeset
```

Select the affected package(s), choose the bump level, and write a one-sentence summary. Commit the generated `.changeset/*.md` file alongside your code change.

## Cutting a release

1. Merge all changesets to `master`.
2. Run `pnpm changeset version` — bumps `package.json` versions and updates `CHANGELOG.md` files.
3. Regenerate examples if the generated-file format changed (major bump).
4. Run `pnpm build && pnpm test` — everything must pass.
5. Commit the version bump: `chore: release vX.Y.Z`.
6. Tag: `git tag vX.Y.Z && git push --tags`.
7. The publish workflow (`.github/workflows/release.yml`) runs automatically on push to `master` and publishes to npm.

## Pre-release versions

Use `pnpm changeset pre enter <tag>` (e.g. `alpha`, `beta`, `rc`) before cutting a pre-release. Exit pre-release mode with `pnpm changeset pre exit` before cutting the stable release.
