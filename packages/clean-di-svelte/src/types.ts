import type { Container } from "clean-di";

/**
 * Infer the exposed bean-bag type from a Container type.
 * Example: `InferExposed<typeof myContainer>` → `{ greeter: Greeter }`
 */
export type InferExposed<C> = C extends Container<unknown, infer TExposed> ? TExposed : never;

/**
 * Infer the config type from a Container type.
 * Example: `InferConfig<typeof myContainer>` → `AppConfig`
 */
export type InferConfig<C> = C extends Container<infer TConfig, unknown> ? TConfig : never;
