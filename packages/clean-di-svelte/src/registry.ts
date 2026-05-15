import type { Container } from "clean-di";

/**
 * Returns the context key for a given container.
 *
 * Svelte's context system accepts any value as a key, so we use the container
 * object itself directly. This eliminates any need for a WeakMap registry.
 */
export function getContextKey<TConfig, TExposed>(
  container: Container<TConfig, TExposed>,
): Container<TConfig, TExposed> {
  return container;
}
