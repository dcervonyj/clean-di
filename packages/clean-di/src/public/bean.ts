/* eslint-disable @typescript-eslint/no-explicit-any --
   `any` in the constructor constraint is the standard TypeScript idiom for "any
   constructor signature". `unknown[]` doesn't compose with `InstanceType<C>` and
   typed parameter lists would break auto-wiring intent. */

import type { BeanDef } from "./types.js";

/**
 * Runtime marker emitted by `bean()`. Codegen reads the call expression in the
 * .di.ts source, resolves `Class`'s constructor signature, and emits the explicit
 * `new Class(...)` call in `.di.generated.ts`. The marker itself is never executed.
 */
export interface BeanMarker<T> extends BeanDef<T> {
  readonly kind: "bean";
  readonly Class: new (...args: any[]) => T;
  readonly overrides: Readonly<Partial<Record<string, string>>>;
}

/**
 * Declare an auto-wired bean. The codegen resolves the constructor signature of
 * `Class` and binds each parameter to a bean in scope, matching by type with
 * parameter-name fallback for ambiguity.
 *
 * The optional `overrides` map is the escape hatch for explicit qualifier-style
 * disambiguation when two beans share a type. Keys are constructor parameter
 * names; values are bean names in the local scope.
 *
 * @example
 *   bean(HttpPostsRepository)
 *   bean(UpdatePropertyUseCase, { loadingRepository: "updateLoadingRepository" })
 */
export function bean<C extends new (...args: any[]) => any>(
  Class: C,
  overrides?: Partial<Record<string, string>>,
): BeanDef<InstanceType<C>> {
  // Double-cast via `unknown` is unavoidable: the marker has no value for the
  // `[BEAN_DEF_BRAND]` unique-symbol key (the brand is type-only). This is the
  // standard nominal-typing pattern for brand-typed factories.
  const marker = {
    kind: "bean",
    Class,
    overrides: overrides ?? {},
  } as unknown as BeanMarker<InstanceType<C>>;
  return marker;
}
