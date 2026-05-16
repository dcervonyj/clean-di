// Shape returned by the builder function in a generated `.di.generated.ts` file.
// The runtime caching/lifecycle code (`createContext`) consumes this trio to wire up a `Container`.
//
// `postConstruct` and `preDestroy` may return `void` (sync hooks) or `Promise<void>`
// (async hooks). The runtime awaits Promise-returning hooks in `init()` / `destroy()`.

export interface BuildResult<TExposed, TConfig = unknown> {
  readonly bag: Record<string, unknown>;
  readonly postConstruct?: (config: TConfig) => void | Promise<void>;
  readonly preDestroy?: (config: TConfig) => void | Promise<void>;
  readonly expose: TExposed;
}
