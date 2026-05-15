import type { Container } from "clean-di";

import type { InferExposed } from "./types.js";
import { useExpose } from "./useExpose.js";

/**
 * Returns a single bean (or any derived value) from the nearest Provider for
 * the given container, using a selector function.
 *
 * The selector runs on every render. Since exposed beans are singletons the
 * result is referentially stable as long as the selector doesn't create new
 * objects inline.
 */
export function useBean<TContainer extends Container<unknown, unknown>, TBean>(
  container: TContainer,
  selector: (exposed: InferExposed<TContainer>) => TBean,
): TBean {
  return selector(useExpose(container));
}
