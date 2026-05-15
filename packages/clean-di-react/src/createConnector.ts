import type { Container } from "clean-di";
import { createElement, type ComponentType, type ReactNode } from "react";

import { DiProvider } from "./DiProvider.js";
import type { InferConfig, InferExposed } from "./types.js";
import { useExpose } from "./useExpose.js";

// Props for the connector's Provider — config required when TConfig ≠ void.
type ConnectorProviderProps<TContainer extends Container<unknown, unknown>> = {
  readonly container: TContainer;
  readonly instanceKey?: unknown;
  readonly children: ReactNode;
} & ([InferConfig<TContainer>] extends [void]
  ? object
  : { readonly config: InferConfig<TContainer> });

/**
 * The object returned by createConnector, bound to the container passed at creation.
 */
export interface Connector<TContainer extends Container<unknown, unknown>> {
  /**
   * Wraps a subtree, making the container's exposed beans available to
   * useBean/useExpose hooks and fullConnect/connect HOCs inside it.
   */
  Provider: (props: ConnectorProviderProps<TContainer>) => ReactNode;

  /**
   * HOC: injects ALL exposed beans as props, removing them from the external signature.
   *
   * @example
   * interface Props { listPosts: ListPostsUseCase; pageSize: number }
   * const PostsListView: React.FC<Props> = (props) => { ... };
   * export const PostsList = fullConnect(PostsListView);
   * // PostsList external signature: { pageSize: number }
   */
  fullConnect<TProps extends Partial<InferExposed<TContainer>>>(
    Component: ComponentType<TProps>,
  ): ComponentType<Omit<TProps, keyof InferExposed<TContainer>>>;

  /**
   * HOC: injects a named subset of exposed beans as props.
   *
   * @example
   * export const PostsList = connect(PostsListView, "listPosts");
   */
  connect<
    TProps extends Partial<InferExposed<TContainer>>,
    K extends keyof InferExposed<TContainer>,
  >(
    Component: ComponentType<TProps>,
    ...keys: K[]
  ): ComponentType<Omit<TProps, K>>;
}

function makeWrapper<TExposed>(
  container: Container<unknown, TExposed>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: ComponentType<any>,
  pickKeys: (keyof TExposed)[] | "all",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ComponentType<any> {
  const Wrapped = (ownProps: Record<string, unknown>): ReactNode => {
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
    // Own props take precedence over injected props.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createElement(Component, { ...injected, ...ownProps } as any);
  };

  Wrapped.displayName = `Connected(${Component.displayName ?? Component.name ?? "Component"})`;
  return Wrapped;
}

/**
 * Creates a connector bound to the given container instance.
 * Both hook-style (useBean/useExpose) and HOC-style (fullConnect/connect) work
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

  const Provider = (props: ConnectorProviderProps<TContainer>): ReactNode => {
    const config =
      "config" in props ? (props as { config: InferConfig<TContainer> }).config : undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (DiProvider as (p: any) => ReactNode)({
      container: props.container,
      instanceKey: props.instanceKey,
      children: props.children,
      ...(config !== undefined ? { config } : {}),
    });
  };

  const fullConnect = <TProps extends Partial<TExposed>>(
    Component: ComponentType<TProps>,
  ): ComponentType<Omit<TProps, keyof TExposed>> => {
    return makeWrapper(
      container as Container<unknown, TExposed>,
      Component,
      "all",
    ) as ComponentType<Omit<TProps, keyof TExposed>>;
  };

  const connect = <TProps extends Partial<TExposed>, K extends keyof TExposed>(
    Component: ComponentType<TProps>,
    ...keys: K[]
  ): ComponentType<Omit<TProps, K>> => {
    return makeWrapper(
      container as Container<unknown, TExposed>,
      Component,
      keys as (keyof TExposed)[],
    ) as ComponentType<Omit<TProps, K>>;
  };

  return { Provider, fullConnect, connect };
}
