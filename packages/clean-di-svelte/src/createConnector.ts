import type { Container } from "clean-di";

import { getBean } from "./getBean.js";
import { getExpose } from "./getExpose.js";
import type { InferExposed } from "./types.js";

/**
 * The object returned by `createConnector`.
 */
export interface Connector<TConfig, TExposed> {
  /**
   * The `DiProvider.svelte` component pre-bound to this container.
   * Import and use like: `<Provider config={...}>{@render children()}</Provider>`
   *
   * Note: This is the path to the DiProvider.svelte component. In Svelte 5
   * you import the component directly; createConnector returns the container
   * reference so callers can pass it to DiProvider themselves, or use the
   * pre-bound helpers below.
   */
  readonly container: Container<TConfig, TExposed>;

  /**
   * Returns the exposed bean-bag for this container from Svelte context.
   * Equivalent to `getExpose(container)`.
   */
  getExpose(): InferExposed<Container<TConfig, TExposed>>;

  /**
   * Returns a single bean selected from the exposed bean-bag.
   * Equivalent to `getBean(container, selector)`.
   */
  getBean<TBean>(selector: (exposed: InferExposed<Container<TConfig, TExposed>>) => TBean): TBean;
}

/**
 * Pre-binds `getExpose` and `getBean` to the given `container`.
 *
 * Useful when a feature module wants to expose its own typed helpers without
 * requiring callers to pass the container reference each time.
 *
 * Unlike the React equivalent, there is no `Provider` component returned
 * (Svelte has no HOC concept). Use `DiProvider.svelte` directly in your
 * Svelte templates with the `container` prop.
 */
export function createConnector<TConfig, TExposed>(
  container: Container<TConfig, TExposed>,
): Connector<TConfig, TExposed> {
  return {
    container,

    getExpose(): InferExposed<Container<TConfig, TExposed>> {
      return getExpose(container);
    },

    getBean<TBean>(
      selector: (exposed: InferExposed<Container<TConfig, TExposed>>) => TBean,
    ): TBean {
      return getBean(container, selector);
    },
  };
}
