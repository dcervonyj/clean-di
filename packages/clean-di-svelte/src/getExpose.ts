import type { Container } from "clean-di";
import { getContext } from "svelte";

import type { InferExposed } from "./types.js";

const NOT_FOUND_MESSAGE =
  "clean-di-svelte: getExpose() called outside a <DiProvider> for this container. " +
  "Make sure the component is rendered inside a <DiProvider container={...}>.";

/**
 * Retrieves the exposed bean-bag for `container` from Svelte context.
 *
 * Must be called during component initialisation (inside a `<script>` block
 * or a function called synchronously during component setup), inside a
 * subtree rendered by `<DiProvider>`.
 *
 * Throws if called outside a `<DiProvider>` for the given container, or if
 * called outside a component lifecycle context entirely.
 */
export function getExpose<TConfig, TExposed>(
  container: Container<TConfig, TExposed>,
): InferExposed<Container<TConfig, TExposed>> {
  let value: InferExposed<Container<TConfig, TExposed>> | undefined;

  try {
    value = getContext<InferExposed<Container<TConfig, TExposed>>>(container);
  } catch {
    throw new Error(NOT_FOUND_MESSAGE);
  }

  if (value === undefined) {
    throw new Error(NOT_FOUND_MESSAGE);
  }

  return value;
}
