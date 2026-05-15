import { createContext } from "react";
import type { Context } from "react";

// Maps each Container instance to its React Context so hooks and HOCs
// can find the right context without knowing the container type statically.
const registry = new WeakMap<object, Context<unknown>>();

export function getOrCreateContext<T>(container: object): Context<T | null> {
  if (!registry.has(container)) {
    registry.set(container, createContext<unknown>(null));
  }
  return registry.get(container) as Context<T | null>;
}
