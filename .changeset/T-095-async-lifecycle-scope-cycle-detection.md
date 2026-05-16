---
"clean-di": minor
---

- Async `postConstruct` and `preDestroy` hooks. Use `await container.init(options)` after `container.get(options)` to wait for async initialisation.
- New `createScope(parentExposed, factory)` for creating child containers with independent lifecycles — e.g. per-request scopes in a web server.
- Runtime circular dependency detection (CDIE-105). The codegen already detects cycles at build time; this is a safety net for direct `createContext` usage.
- `container.destroy()` and `container.destroyAll()` now return `Promise<void>` (was `void`). Existing call sites without `await` continue to work.
