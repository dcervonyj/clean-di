import type { CachedInstance, Container } from "./Container.js";
import type { BuildResult } from "./buildResult.js";

// Locally typed `console` — clean-di is framework-agnostic core (no DOM, no Node
// types pulled in). `console.warn` is universally available in every JS runtime.
declare const console: { warn(message: string): void };

const SINGLETON_KEY = Symbol("clean-di:singleton");

// Module-level set tracking keys currently inside their builder call.
// If a builder calls back into the same `get()` for the same key, we throw
// CDIE-105 (runtime circular dependency detection). The codegen catches cycles
// at build time (CDI-003); this guard covers direct `createContext` usage.
const buildingKeys = new Set<unknown>();

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export function createContext<TConfig, TExposed>(
  builder: (config: TConfig) => BuildResult<TExposed, TConfig>,
): Container<TConfig, TExposed> {
  const cache = new Map<unknown, CachedInstance<TExposed>>();
  const destroyedKeys = new Set<unknown>();

  function get(options: { config?: TConfig; key?: unknown } = {}): TExposed {
    const key = options.key ?? SINGLETON_KEY;

    if (destroyedKeys.has(key)) {
      throw new Error(`CDIE-101: get() called for key ${String(key)} after destroy().`);
    }

    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached.exposed;
    }

    if (buildingKeys.has(key)) {
      throw new Error(
        `CDIE-105: Circular dependency detected while constructing container (key: ${String(
          key,
        )}). A bean's constructor called container.get() with the same key.`,
      );
    }

    const config = options.config as TConfig;

    let result: BuildResult<TExposed, TConfig>;
    buildingKeys.add(key);
    try {
      result = builder(config);
    } finally {
      buildingKeys.delete(key);
    }

    const preDestroy = result.preDestroy as ((config: unknown) => void | Promise<void>) | undefined;

    if (result.postConstruct === undefined) {
      const entry: CachedInstance<TExposed> = {
        exposed: result.expose,
        preDestroy,
        config,
      };
      cache.set(key, entry);

      return entry.exposed;
    }

    let postConstructResult: void | Promise<void>;
    try {
      postConstructResult = result.postConstruct(config);
    } catch (err) {
      // Sync throw from postConstruct: keep the original cleanup path (sync).
      runPreDestroyForCleanup(preDestroy, config);
      throw wrapPostConstructError(err);
    }

    if (!isPromiseLike(postConstructResult)) {
      const entry: CachedInstance<TExposed> = {
        exposed: result.expose,
        preDestroy,
        config,
      };
      cache.set(key, entry);

      return entry.exposed;
    }

    // Async postConstruct: cache the entry immediately so `get()` is non-blocking,
    // store the awaitable promise on the entry so `init()` can await it. Rejection
    // path deletes the cache entry and runs preDestroy for cleanup, then re-throws
    // wrapped in CDIE-103 (so `await init()` surfaces the same error code as sync).
    const initPromise = postConstructResult.then(
      () => undefined,
      async (err: unknown) => {
        cache.delete(key);
        await runPreDestroyForCleanupAsync(preDestroy, config);
        throw wrapPostConstructError(err);
      },
    );
    // Attach a no-op rejection handler so Node does NOT report an unhandled
    // rejection if the caller forgets to call `init()`. The original promise
    // still rejects when awaited via `init()` — `.catch()` returns a separate
    // fulfilled promise we discard. Without this, async-postConstruct failures
    // would crash the process under `process.on('unhandledRejection')`.
    initPromise.catch(() => undefined);

    const entry: CachedInstance<TExposed> = {
      exposed: result.expose,
      preDestroy,
      config,
      initPromise,
    };
    cache.set(key, entry);

    return entry.exposed;
  }

  async function init(options: { config?: TConfig; key?: unknown } = {}): Promise<void> {
    const key = options.key ?? SINGLETON_KEY;
    const entry = cache.get(key);

    if (entry === undefined) {
      throw new Error(
        `CDIE-106: init() called for key ${String(key)} before get(). Call get() first to construct the instance.`,
      );
    }

    if (entry.initPromise !== undefined) {
      await entry.initPromise;
    }
  }

  async function destroy(key?: unknown): Promise<void> {
    const resolvedKey = key ?? SINGLETON_KEY;
    const entry = cache.get(resolvedKey);

    if (entry === undefined) {
      console.warn(`CDIE-102: destroy() called for unknown key ${String(resolvedKey)}.`);

      return;
    }

    cache.delete(resolvedKey);
    destroyedKeys.add(resolvedKey);

    if (entry.preDestroy === undefined) {
      return;
    }

    try {
      const result = entry.preDestroy(entry.config);
      if (isPromiseLike(result)) {
        await result;
      }
    } catch (err) {
      throw new AggregateError([err], "CDIE-104: preDestroy errors during teardown.");
    }
  }

  async function destroyAll(): Promise<void> {
    const keys = Array.from(cache.keys());

    const settled = await Promise.allSettled(keys.map((k) => destroy(k)));

    const errors: unknown[] = [];
    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        const reason = outcome.reason;
        if (reason instanceof AggregateError) {
          errors.push(...reason.errors);
        } else {
          errors.push(reason);
        }
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "CDIE-104: preDestroy errors during teardown.");
    }
  }

  return { get, init, destroy, destroyAll } as Container<TConfig, TExposed>;
}

function wrapPostConstructError(err: unknown): Error {
  return new Error(
    `CDIE-103: postConstruct threw: ${err instanceof Error ? err.message : String(err)}`,
    { cause: err },
  );
}

function runPreDestroyForCleanup(
  preDestroy: ((config: unknown) => void | Promise<void>) | undefined,
  config: unknown,
): void {
  if (preDestroy === undefined) {
    return;
  }
  try {
    // Swallow both sync throws and async rejections — do not mask the original
    // postConstruct error. For async preDestroy we deliberately do NOT await:
    // the sync-failure path stays synchronous to preserve existing semantics.
    const result = preDestroy(config);
    if (isPromiseLike(result)) {
      result.then(
        () => undefined,
        () => undefined,
      );
    }
  } catch {
    /* swallow — do not mask the original postConstruct error */
  }
}

async function runPreDestroyForCleanupAsync(
  preDestroy: ((config: unknown) => void | Promise<void>) | undefined,
  config: unknown,
): Promise<void> {
  if (preDestroy === undefined) {
    return;
  }
  try {
    const result = preDestroy(config);
    if (isPromiseLike(result)) {
      await result;
    }
  } catch {
    /* swallow — do not mask the original postConstruct error */
  }
}
