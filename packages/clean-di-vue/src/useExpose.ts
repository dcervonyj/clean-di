import type { Container } from "clean-di";
import { inject } from "vue";

import { getOrCreateInjectionKey } from "./registry.js";
import type { InferExposed } from "./types.js";

/**
 * Returns the full exposed bean bag from the nearest DiProvider (or
 * createConnector Provider) for the given container.
 *
 * Must be called inside a matching Provider. Throws a clear error otherwise.
 */
export function useExpose<TContainer extends Container<unknown, unknown>>(
  container: TContainer,
): InferExposed<TContainer> {
  const key = getOrCreateInjectionKey<InferExposed<TContainer>>(container);
  const value = inject(key);

  if (value === undefined) {
    throw new Error(
      "clean-di-vue: useExpose() called outside a matching <DiProvider> or <Provider>. " +
        "Ensure the component is rendered inside the provider for this container.",
    );
  }

  return value;
}
