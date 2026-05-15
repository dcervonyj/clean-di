import type { Container } from "clean-di";
import { defineComponent, h, mergeProps } from "vue";
import type { Component } from "vue";

import { DiProvider } from "./DiProvider.js";
import type { InferConfig, InferExposed } from "./types.js";
import { useExpose } from "./useExpose.js";

// Props for the connector's Provider — config required when TConfig ≠ void.
type ConnectorProviderProps<TContainer extends Container<unknown, unknown>> = {
  readonly container: TContainer;
  readonly instanceKey?: unknown;
} & ([InferConfig<TContainer>] extends [void]
  ? object
  : { readonly config: InferConfig<TContainer> });

/**
 * The object returned by createConnector, bound to the container passed at creation.
 */
export interface Connector<TContainer extends Container<unknown, unknown>> {
  /**
   * Wraps a subtree, making the container's exposed beans available to
   * useBean/useExpose composables and fullConnect/connect HOCs inside it.
   */
  Provider: Component;

  /**
   * HOC: injects ALL exposed beans as props, removing them from the external signature.
   *
   * @example
   * interface Props { listPosts: ListPostsUseCase; pageSize: number }
   * const PostsListView = defineComponent({ ... });
   * export const PostsList = fullConnect(PostsListView);
   * // PostsList external signature: { pageSize: number }
   */
  fullConnect(Component: Component): Component;

  /**
   * HOC: injects a named subset of exposed beans as props.
   *
   * @example
   * export const PostsList = connect(PostsListView, "listPosts");
   */
  connect(Component: Component, ...keys: (keyof InferExposed<TContainer>)[]): Component;
}

function makeWrapper<TExposed>(
  container: Container<unknown, TExposed>,
  WrappedComponent: Component,
  pickKeys: (keyof TExposed)[] | "all",
): Component {
  const name =
    (WrappedComponent as { name?: string; displayName?: string }).displayName ??
    (WrappedComponent as { name?: string }).name ??
    "Component";

  return defineComponent({
    name: `Connected(${name})`,
    setup(_props, { attrs, slots }) {
      return () => {
        const exposed = useExpose(container);
        let injected: Partial<TExposed>;

        if (pickKeys === "all") {
          injected = exposed;
        } else {
          injected = {};
          for (const k of pickKeys) {
            (injected as Record<string, unknown>)[k as string] = exposed[k];
          }
        }

        // Own props (attrs) take precedence over injected props.
        const mergedProps = mergeProps(injected as Record<string, unknown>, attrs);

        return h(WrappedComponent, mergedProps, slots);
      };
    },
  });
}

/**
 * Creates a connector bound to the given container instance.
 * Both composable-style (useBean/useExpose) and HOC-style (fullConnect/connect) work
 * inside the returned Provider — they share the same WeakMap registry.
 *
 * @example
 * import { blogContext } from "../BlogContext.di.generated";
 * export const { Provider, fullConnect } = createConnector(blogContext);
 */
export function createConnector<TContainer extends Container<unknown, unknown>>(
  container: TContainer,
): Connector<TContainer> {
  type TExposed = InferExposed<TContainer>;

  const Provider = defineComponent({
    name: "ConnectorProvider",
    setup(_props, { attrs, slots }) {
      return () => {
        const providerProps = attrs as ConnectorProviderProps<TContainer>;

        // Cast needed: h() overloads require a concrete component instance type,
        // but we're passing runtime props whose exact shape depends on TConfig.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return h(DiProvider as any, providerProps as Record<string, unknown>, slots);
      };
    },
  });

  const fullConnect = (WrappedComponent: Component): Component => {
    return makeWrapper(container as Container<unknown, TExposed>, WrappedComponent, "all");
  };

  const connect = (WrappedComponent: Component, ...keys: (keyof TExposed)[]): Component => {
    return makeWrapper(container as Container<unknown, TExposed>, WrappedComponent, keys);
  };

  return { Provider, fullConnect, connect };
}

export function createConnectorWithObserver<TContainer extends Container<unknown, unknown>>(
  container: TContainer,
  wrapObserver: (c: Component) => Component,
): Connector<TContainer> {
  type TExposed = InferExposed<TContainer>;

  const base = createConnector(container);

  const fullConnect = (WrappedComponent: Component): Component => {
    // Wrap the WrappedComponent itself in the observer HOC before injecting props.
    // This ensures observable reads inside WrappedComponent's render are tracked
    // by MobX — if we wrapped the outer Connector instead, those reads would
    // happen outside the MobX tracking context (Vue renders children separately).
    return makeWrapper(
      container as Container<unknown, TExposed>,
      wrapObserver(WrappedComponent),
      "all",
    );
  };

  const connect = (WrappedComponent: Component, ...keys: (keyof TExposed)[]): Component => {
    return makeWrapper(
      container as Container<unknown, TExposed>,
      wrapObserver(WrappedComponent),
      keys,
    );
  };

  return { Provider: base.Provider, fullConnect, connect };
}
