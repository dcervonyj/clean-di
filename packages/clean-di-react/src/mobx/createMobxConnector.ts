import type { Container } from "clean-di";
import { observer } from "mobx-react-lite";
import type { ComponentType, FunctionComponent } from "react";

import { createConnector } from "../createConnector.js";
import type { Connector } from "../createConnector.js";
import type { InferExposed } from "../types.js";

/**
 * Same as createConnector, but fullConnect/connect wrap each component in
 * mobx-react-lite's observer() so MobX observables in injected beans trigger
 * re-renders automatically.
 *
 * Requires mobx-react-lite to be installed as a peer dependency.
 *
 * @example
 * import { createMobxConnector } from "clean-di-react/mobx";
 * export const { Provider, fullConnect } = createMobxConnector(blogContext);
 */
export function createMobxConnector<TContainer extends Container<unknown, unknown>>(
  container: TContainer,
): Connector<TContainer> {
  type TExposed = InferExposed<TContainer>;
  const base = createConnector(container);

  const fullConnect = <TProps extends Partial<TExposed>>(
    Component: ComponentType<TProps>,
  ): ComponentType<Omit<TProps, keyof TExposed>> => {
    return base.fullConnect(
      observer(Component as unknown as FunctionComponent<TProps>) as ComponentType<TProps>,
    );
  };

  const connect = <TProps extends Partial<TExposed>, K extends keyof TExposed>(
    Component: ComponentType<TProps>,
    ...keys: K[]
  ): ComponentType<Omit<TProps, K>> => {
    return base.connect(
      observer(Component as unknown as FunctionComponent<TProps>) as ComponentType<TProps>,
      ...keys,
    );
  };

  return { Provider: base.Provider, fullConnect, connect };
}
