import type { Container } from "clean-di";
import { Reaction } from "mobx";
import type { Component, ComponentOptions, SetupContext, VNode } from "vue";
import { defineComponent, onUnmounted, shallowRef } from "vue";

import { createConnectorWithObserver } from "../createConnector.js";
import type { Connector } from "../createConnector.js";

type RenderFn = () => VNode | null;

/**
 * Wraps a Vue component (defined via defineComponent + setup returning a render
 * function) so that MobX observable reads inside its render function trigger
 * Vue re-renders automatically.
 *
 * Strategy: call the WrappedComponent's own setup() — passing ctx.attrs as
 * props so the render closure captures a reactive reference — then invoke the
 * returned render function inside a MobX Reaction.track() on every cycle.
 * A shallowRef counter bridges MobX reactivity into Vue's scheduler.
 */
function makeObserverComponent(WrappedComponent: Component): Component {
  const options = WrappedComponent as ComponentOptions;
  const name = options.name ?? "Component";

  return defineComponent({
    name,
    // Re-declare the wrapped component's props so Vue routes them into `props`
    // rather than attrs (needed for setup to receive them correctly).
    props: options.props,
    setup(props, ctx: SetupContext) {
      // Counter ref: Vue re-runs our render function whenever this increments.
      const renderCount = shallowRef(0);

      const mobxReaction = new Reaction(`MobXObserver(${name})`, () => {
        renderCount.value++;
      });

      onUnmounted(() => {
        mobxReaction.dispose();
      });

      // Call the wrapped component's setup to obtain its render function.
      // `props` is Vue's reactive proxy for declared props — identical to what
      // View would receive if mounted normally, because we re-declared its props.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const innerRender = options.setup?.(props as any, ctx) as RenderFn | undefined;

      return (): VNode | null => {
        // Touch renderCount so Vue re-runs this closure when it changes.
        renderCount.value; // eslint-disable-line @typescript-eslint/no-unused-expressions

        if (innerRender === undefined) {
          return null;
        }

        let result: VNode | null = null;

        // Run the inner render inside a MobX tracking context so any observable
        // read during innerRender() (e.g. store.suffix) is tracked and will
        // trigger the Reaction's effect when it changes.
        mobxReaction.track(() => {
          result = innerRender();
        });

        return result;
      };
    },
  });
}

/**
 * Same as createConnector, but fullConnect/connect wrap each component with a
 * MobX Reaction so that observable reads during render trigger re-renders.
 *
 * Requires mobx to be installed (it is already a transitive dependency).
 *
 * @example
 * import { createMobxConnector } from "clean-di-vue/mobx";
 * export const { Provider, fullConnect } = createMobxConnector(blogContext);
 */
export function createMobxConnector<TContainer extends Container<unknown, unknown>>(
  container: TContainer,
): Connector<TContainer> {
  return createConnectorWithObserver(container, makeObserverComponent);
}
