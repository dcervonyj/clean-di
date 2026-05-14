import type { BuildResult } from "./buildResult.js";
import type { CachedInstance, Container } from "./Container.js";

// Locally typed `console` — clean-di is framework-agnostic core (no DOM, no Node
// types pulled in). `console.warn` is universally available in every JS runtime.
declare const console: { warn(message: string): void };

const SINGLETON_KEY = Symbol("clean-di:singleton");

export function createContext<TConfig, TExposed>(
  builder: (config: TConfig) => BuildResult<TExposed>,
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

    const config = options.config as TConfig;
    const result = builder(config);
    const entry: CachedInstance<TExposed> = {
      exposed: result.expose,
      preDestroy: result.preDestroy,
      config,
    };
    cache.set(key, entry);

    if (result.postConstruct !== undefined) {
      try {
        result.postConstruct(config);
      } catch (err) {
        cache.delete(key);
        if (result.preDestroy !== undefined) {
          try {
            result.preDestroy(config);
          } catch {
            /* swallow — do not mask the original postConstruct error */
          }
        }
        throw new Error(
          `CDIE-103: postConstruct threw: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
    }

    return entry.exposed;
  }

  function destroy(key?: unknown): void {
    const resolvedKey = key ?? SINGLETON_KEY;
    const entry = cache.get(resolvedKey);

    if (entry === undefined) {
      // eslint-disable-next-line no-console
      console.warn(`CDIE-102: destroy() called for unknown key ${String(resolvedKey)}.`);

      return;
    }

    cache.delete(resolvedKey);
    destroyedKeys.add(resolvedKey);

    if (entry.preDestroy !== undefined) {
      try {
        entry.preDestroy(entry.config);
      } catch (err) {
        throw new AggregateError([err], "CDIE-104: preDestroy errors during teardown.");
      }
    }
  }

  function destroyAll(): void {
    const keys = Array.from(cache.keys());
    const errors: unknown[] = [];

    for (const key of keys) {
      try {
        destroy(key);
      } catch (err) {
        if (err instanceof AggregateError) {
          errors.push(...err.errors);
        } else {
          errors.push(err);
        }
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "CDIE-104: preDestroy errors during teardown.");
    }
  }

  return { get, destroy, destroyAll } as Container<TConfig, TExposed>;
}
