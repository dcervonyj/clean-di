/**
 * Container.ts
 *
 * `Container<TConfig, TExposed>` is the public runtime surface returned by the
 * generated file's `defineContext` output (via `createContext`). It is the
 * type users interact with at runtime: `get`, `init`, `destroy`, `destroyAll`.
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
   *
   * Always synchronous. If the underlying `postConstruct` is async, the returned
   * exposed object is still available immediately — but observable side-effects
   * of `postConstruct` may not have happened yet. Call `init()` to await them.
   */
  get(
    options: TConfig extends void
      ? { readonly key?: unknown }
      : { readonly config: TConfig; readonly key?: unknown },
  ): TExposed;

  /**
   * Await any pending async `postConstruct` for the instance associated with `key`.
   *
   * Must be called AFTER `get()` with the matching options (otherwise CDIE-106 is
   * thrown). For sync `postConstruct`, returns a resolved promise. Idempotent:
   * repeated calls return the same promise.
   *
   * If the async `postConstruct` rejected, the rejection is rethrown wrapped in
   * CDIE-103 and the cache entry is evicted (so a subsequent `get()` rebuilds).
   */
  init(
    options: TConfig extends void
      ? { readonly key?: unknown }
      : { readonly config: TConfig; readonly key?: unknown },
  ): Promise<void>;

  /**
   * Run `preDestroy` and evict the cached entry for `key`.
   * Calling for an unknown key emits CDIE-102 (warn, no throw).
   *
   * Returns a `Promise<void>` so async `preDestroy` hooks can be awaited.
   * Existing call-sites that discard the return value continue to work.
   */
  destroy(key?: unknown): Promise<void>;

  /**
   * Destroy every cached instance. All `preDestroy` hooks run in parallel
   * (`Promise.all`). Returns a `Promise<void>` so async hooks can be awaited.
   */
  destroyAll(): Promise<void>;
}

/**
 * Internal cache entry held by createContext's Map.
 * Keeps the resolved `exposed`, the (optional) `preDestroy` callback (already bound to `config`),
 * the original `config` (kept for diagnostics), and an optional `initPromise` that resolves
 * when an async `postConstruct` finishes.
 */
export interface CachedInstance<TExposed> {
  readonly exposed: TExposed;
  readonly preDestroy: ((config: unknown) => void | Promise<void>) | undefined;
  readonly config: unknown;
  readonly initPromise?: Promise<void>;
}
