import type { Container } from "clean-di";

import { getExpose } from "./getExpose.js";
import type { InferExposed } from "./types.js";

/**
 * Retrieves a single bean from the exposed bean-bag for `container`.
 *
 * A convenience wrapper around `getExpose` that applies a selector function.
 * Must be called during component initialisation, inside a `<DiProvider>` subtree.
 */
export function getBean<TConfig, TExposed, TBean>(
  container: Container<TConfig, TExposed>,
  selector: (exposed: InferExposed<Container<TConfig, TExposed>>) => TBean,
): TBean {
  const exposed = getExpose(container);

  return selector(exposed);
}
