import type { Container } from "../runtime/Container.js";
import type { Beans, ContextSpec, ExposedOf } from "./types.js";

/**
 * Top-level construct. Returns a curried factory. The outer call pins `TConfig`;
 * the inner call accepts the spec and produces a typed `Container` reference.
 *
 * At runtime, before `clean-di-codegen` has run, the returned object is a
 * fail-loud guard: any attempt to call `get` / `destroy` / `destroyAll` throws
 * with a message instructing the user to regenerate. After codegen, the
 * `.di.generated.ts` file shadows this marker with a real `createContext(...)`
 * result.
 *
 * Authors still get type-safe Container references at the call site even before
 * codegen has run — important for editor IntelliSense.
 *
 * The curried form is load-bearing (DESIGN §5.1): it lets the user pin
 * `TConfig` explicitly while keeping `TBeans` inferring from the spec literal.
 * A single-call signature `defineContext<TConfig, TBeans>(spec)` would force
 * the user to either spell out `TBeans` (verbose, error-prone) or accept the
 * unhelpful `unknown` widening that TypeScript falls back to when only some
 * generics are supplied.
 */
export function defineContext<TConfig = void>(): <TBeans extends Beans>(
  spec: ContextSpec<TConfig, TBeans>,
) => Container<
  TConfig,
  ExposedOf<TBeans, GetExposeKeys<TConfig, TBeans, ContextSpec<TConfig, TBeans>>>
> {
  return <TBeans extends Beans>(
    spec: ContextSpec<TConfig, TBeans>,
  ): Container<
    TConfig,
    ExposedOf<TBeans, GetExposeKeys<TConfig, TBeans, ContextSpec<TConfig, TBeans>>>
  > => {
    const FAIL_MESSAGE =
      "clean-di: this Container is a placeholder. " +
      "Run `clean-di-codegen` to produce the .di.generated.ts file that backs this context.";

    const marker = {
      get(): never {
        throw new Error(FAIL_MESSAGE);
      },
      destroy(): never {
        throw new Error(FAIL_MESSAGE);
      },
      destroyAll(): never {
        throw new Error(FAIL_MESSAGE);
      },
      /** Internal-only marker for codegen AST recognition. */
      __clean_di_spec__: spec,
    };

    return marker as unknown as Container<
      TConfig,
      ExposedOf<TBeans, GetExposeKeys<TConfig, TBeans, ContextSpec<TConfig, TBeans>>>
    >;
  };
}

/** Helper: extract the `expose` field's tuple type from a spec.
 *  Parametrised over `TConfig` (not `unknown`) because `ContextSpec`'s lifecycle
 *  hooks place `TConfig` in a contravariant position. */
type GetExposeKeys<
  TConfig,
  TBeans extends Beans,
  S extends ContextSpec<TConfig, TBeans>,
> = S extends {
  readonly expose: infer E;
}
  ? E extends readonly (keyof TBeans & string)[]
    ? E
    : readonly (keyof TBeans & string)[]
  : readonly (keyof TBeans & string)[];
