import type { Container } from "clean-di";
import { defineComponent, onUnmounted, provide } from "vue";

import { getOrCreateInjectionKey } from "./registry.js";

export const DiProvider = defineComponent({
  name: "DiProvider",
  props: {
    container: {
      type: Object as () => Container<unknown, unknown>,
      required: true,
    },
    instanceKey: {
      type: null as unknown as () => unknown,
      default: undefined,
    },
    config: {
      type: null as unknown as () => unknown,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    const { container, instanceKey, config } = props;

    // Stable key — setup runs once, so this Symbol is stable for the component lifetime.
    const stableKey: unknown = instanceKey ?? Symbol("clean-di-vue");

    // Call get() synchronously in setup — idempotent per key.
    // The `as` cast is unavoidable: Container<unknown,unknown> requires a config arg at the
    // type level, but the runtime path only passes it when the user supplies one.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exposed = (container as Container<any, unknown>).get(
      config !== undefined ? { config, key: stableKey } : { key: stableKey },
    );

    provide(getOrCreateInjectionKey<unknown>(container), exposed);

    // Vue has no StrictMode double-mount, so no microtask deferral needed.
    onUnmounted(() => {
      container.destroy(stableKey);
    });

    return () => slots.default?.();
  },
});
