import type { Container } from "./Container.js";
import type { BuildResult } from "./buildResult.js";
import { createContext } from "./createContext.js";

/**
 * Create a child (scoped) container that exposes parent beans plus child beans,
 * with an independent lifecycle. Useful for per-request scopes (e.g. one
 * `currentUser` + `requestId` per HTTP request) and for test isolation.
 *
 * Design choice: the parent's exposed bag is pre-resolved by the caller and
 * handed in directly. This keeps `createScope` itself config-free (`TConfig =
 * void`) regardless of the parent's `TConfig`, and avoids re-triggering the
 * parent's config requirement at scope-construction time.
 *
 * The scope's lifecycle is independent of the parent's — destroying the scope
 * does NOT destroy the parent, and vice versa.
 *
 * @example
 * ```ts
 * const appBeans = appContainer.get({ config });
 * const reqScope = createScope(appBeans, (app) => ({
 *   bag: { currentUser, requestId },
 *   expose: { currentUser, requestId },
 * }));
 * const { currentUser, listPosts } = reqScope.get({});
 * await reqScope.destroy();
 * ```
 */
export function createScope<TParentExposed extends object, TScoped>(
  parentExposed: TParentExposed,
  factory: (parent: TParentExposed) => BuildResult<TScoped, void>,
): Container<void, TParentExposed & TScoped> {
  return createContext<void, TParentExposed & TScoped>(() => {
    const childResult = factory(parentExposed);

    const merged: BuildResult<TParentExposed & TScoped, void> = {
      bag: { ...childResult.bag },
      expose: { ...parentExposed, ...childResult.expose } as TParentExposed & TScoped,
      ...(childResult.postConstruct !== undefined
        ? { postConstruct: childResult.postConstruct }
        : {}),
      ...(childResult.preDestroy !== undefined ? { preDestroy: childResult.preDestroy } : {}),
    };

    return merged;
  });
}
