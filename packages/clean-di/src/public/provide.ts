import type { BeanDef } from "./types.js";

/**
 * Runtime marker emitted by `provide()`. At build time, codegen reads the AST around
 * `provide(factory)` and inlines the factory's expression body into the generated file.
 * At runtime, the marker itself is never executed — it only carries type information
 * plus the factory reference (useful for hand-written generated fixtures and tests).
 */
export interface ProvideMarker<T> extends BeanDef<T> {
  readonly kind: "provide";
  readonly factory: (config: unknown) => T;
}

/**
 * Declare an explicit factory binding. Use for config-derived values, third-party
 * library instances, conditional construction — anything the codegen can't infer
 * from a constructor signature.
 *
 * @example
 *   provide<string>((cfg) => cfg.apiBaseUrl);
 *   provide(() => new ApolloClient({ uri: "https://..." }));
 */
export function provide<T>(factory: (config: never) => T): BeanDef<T> {
  const marker: ProvideMarker<T> = {
    kind: "provide",
    factory: factory as (config: unknown) => T,
    // The brand is type-only; runtime value of the brand key is intentionally undefined.
  } as ProvideMarker<T>;
  return marker;
}
