import type { InjectionKey } from "vue";

// Maps each Container instance to its Vue InjectionKey so hooks and HOCs
// can find the right injection without knowing the container type statically.
const registry = new WeakMap<object, InjectionKey<unknown>>();

export function getOrCreateInjectionKey<T>(container: object): InjectionKey<T> {
  if (!registry.has(container)) {
    registry.set(container, Symbol("clean-di-vue") as InjectionKey<unknown>);
  }

  return registry.get(container) as InjectionKey<T>;
}
