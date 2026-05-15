import type { Container } from "clean-di";

/** Extracts the TExposed type from a Container. */
export type InferExposed<C> = C extends Container<unknown, infer E> ? E : never;

/** Extracts the TConfig type from a Container. */
export type InferConfig<C> = C extends Container<infer Cfg, unknown> ? Cfg : never;
