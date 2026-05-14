/**
 * Container.ts
 *
 * `Container<TConfig, TExposed>` is the public runtime surface returned by the
 * generated file's `defineContext` output (via `createContext`). It is the
 * type users interact with at runtime: `get`, `destroy`, `destroyAll`.
 *
 * `CachedInstance<TExposed>` is the internal cache entry held by
 * `createContext.ts`'s `Map<unknown, CachedInstance>`. It is intentionally
 * NOT re-exported from `index.ts` — only `createContext.ts` consumes it.
 *
 * This module is type-only: zero runtime emit.
 */

/**
 * The runtime object returned by defineContext (after codegen produces the generated file).
 * Caches instances by an opaque `key`. Identity-compared.
 */
export interface Container<TConfig, TExposed> {
  /**
   * Return the exposed bean bag for this `key` (or a default singleton key if omitted).
   * Idempotent: same `key` returns the same `TExposed` reference.
   */
  get(
    options: TConfig extends void
      ? { readonly key?: unknown }
      : { readonly config: TConfig; readonly key?: unknown },
  ): TExposed;

  /**
   * Run `preDestroy` and evict the cached entry for `key`.
   * Calling for an unknown key emits CDIE-102 (warn, no throw).
   */
  destroy(key?: unknown): void;

  /**
   * Destroy every cached instance.
   */
  destroyAll(): void;
}

/**
 * Internal cache entry held by createContext's Map.
 * Keeps the resolved `exposed`, the (optional) `preDestroy` callback (already bound to `config`),
 * and the original `config` (kept for diagnostics).
 */
export interface CachedInstance<TExposed> {
  readonly exposed: TExposed;
  readonly preDestroy: ((config: unknown) => void) | undefined;
  readonly config: unknown;
}
