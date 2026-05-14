# clean-di

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**Type-safe DI without decorators. Wired at build time, not runtime.**

## Why clean-di?

Most TypeScript DI frameworks require `experimentalDecorators`, `emitDecoratorMetadata`, and `reflect-metadata` — polluting your `tsconfig`, bloating your bundle, and adding fragile runtime reflection.

`clean-di` takes a different approach:

- ✅ **No decorators** — no `@Injectable`, no `@Inject`, no metadata
- ✅ **No `reflect-metadata`** — zero runtime reflection
- ✅ **No `experimentalDecorators`** in `tsconfig`
- ✅ **Fully inferred types** — your container is typed end-to-end, no casts
- ✅ **Tree-shakable output** — codegen emits plain object factories
- ✅ **Zero runtime overhead** beyond ordinary object creation

## Packages

| Package                                           | Description                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| [`clean-di`](./packages/clean-di)                 | Runtime library — `defineContext`, `bean`, `Container`              |
| [`clean-di-codegen`](./packages/clean-di-codegen) | CLI code generator — reads `.di.ts` files, emits `.di.generated.ts` |

## Install

```bash
npm install clean-di
npm install --save-dev clean-di-codegen
```

## Three-line tour

```ts
// greeter.di.ts — your context definition (source of truth)
import { defineContext, bean } from "clean-di";
import { Logger } from "./Logger.js";
import { Greeter } from "./Greeter.js";

export const greeterContext = defineContext<{ name: string }>()({
  beans: {
    logger: bean(Logger),
    greeter: bean(Greeter),
  },
  expose: ["greeter"] as const,
});
```

```bash
# Generate the wiring — commit the output
npx clean-di-codegen
```

```ts
// index.ts — fully typed, no casts
import { createContext } from "./greeter.di.generated.js";

const container = createContext({ name: "World" });
container.greeter.greet(); // → Hello, World!
```

## How it works

1. **Write `.di.ts` files** — define your context with `defineContext` and declare beans with `bean(ClassName)`.
2. **Run `clean-di-codegen`** — the CLI analyses your context definition and emits a `.di.generated.ts` file with a typed `createContext` factory.
3. **Commit the generated file** — no build-time magic required; the generated file is plain TypeScript.
4. **Use `container.get()`** — or access beans directly via the typed container object.

The codegen step happens once (or whenever your context changes). At runtime, `clean-di` is just object construction — no container registry, no reflection, no surprises.

## Examples

| Example                                             | Description                                           |
| --------------------------------------------------- | ----------------------------------------------------- |
| [basic](./examples/basic/README.md)                 | Minimal setup: two beans, one config type             |
| [modular](./examples/modular/README.md)             | Multiple contexts with cross-context imports          |
| [full-blog-app](./examples/full-blog-app/README.md) | Real-world layered app (controllers, services, repos) |

## Docs

- [Getting Started](./doc/GETTING_STARTED.md)
- [Migration Guide](./doc/MIGRATION.md)
- [Design Document](./doc/DESIGN.md)

## Comparison

|                     | **clean-di** | InversifyJS | tsyringe | Awilix | Brandi |
| ------------------- | :----------: | :---------: | :------: | :----: | :----: |
| Decorators required |      ❌      |     ✅      |    ✅    |   ❌   |   ✅   |
| `reflect-metadata`  |      ❌      |     ✅      |    ✅    |   ❌   |   ❌   |
| Codegen             |      ✅      |     ❌      |    ❌    |   ❌   |   ❌   |
| Tree-shakable       |      ✅      |     ❌      |    ❌    |   ⚠️   |   ⚠️   |
| TypeScript-first    |      ✅      |     ⚠️      |    ⚠️    |   ⚠️   |   ✅   |

> ✅ Yes · ❌ No · ⚠️ Partial

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, workflow, and commit conventions.

## License

[MIT](./LICENSE)
