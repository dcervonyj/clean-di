// Shape returned by the builder function in a generated `.di.generated.ts` file.
// The runtime caching/lifecycle code (`createContext`) consumes this trio to wire up a `Container`.

export interface BuildResult<TExposed> {
  readonly bag: Record<string, unknown>;
  readonly postConstruct?: (config: unknown) => void;
  readonly preDestroy?: (config: unknown) => void;
  readonly expose: TExposed;
}
