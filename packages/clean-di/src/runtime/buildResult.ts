// Shape returned by the builder function in a generated `.di.generated.ts` file.
// The runtime caching/lifecycle code (`createContext`) consumes this trio to wire up a `Container`.

export interface BuildResult<TExposed, TConfig = unknown> {
  readonly bag: Record<string, unknown>;
  readonly postConstruct?: (config: TConfig) => void;
  readonly preDestroy?: (config: TConfig) => void;
  readonly expose: TExposed;
}
