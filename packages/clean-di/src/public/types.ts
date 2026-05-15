// Shared type vocabulary for the clean-di public DSL: BeanDef brand, bean bags,
// and the spec shapes consumed by defineContext / defineConfig. The BeanDef
// brand key is a `unique symbol` so values from a different DI ecosystem cannot
// accidentally typecheck as a BeanDef from this one.

declare const BEAN_DEF_BRAND: unique symbol;

export interface BeanDef<T> {
  readonly [BEAN_DEF_BRAND]: T;
}

export type InferBeanValue<B> = B extends BeanDef<infer T> ? T : never;

export type Beans = Record<string, BeanDef<unknown>>;

export type ExposedOf<
  TBeans extends Beans,
  TExposeKeys extends readonly (keyof TBeans & string)[],
> = Pick<{ [K in keyof TBeans]: InferBeanValue<TBeans[K]> }, TExposeKeys[number]>;

export interface ContextSpec<TConfig, TBeans extends Beans> {
  readonly imports?: readonly unknown[];
  readonly beans: TBeans;
  readonly postConstruct?: (
    beans: { readonly [K in keyof TBeans]: InferBeanValue<TBeans[K]> },
    config: TConfig,
  ) => void;
  readonly preDestroy?: (
    beans: { readonly [K in keyof TBeans]: InferBeanValue<TBeans[K]> },
    config: TConfig,
  ) => void;
  /**
   * Which bean keys to expose from the merged scope (local + imported).
   * Accepts both local keys (`keyof TBeans`) and imported bean keys (which
   * TypeScript cannot infer from the untyped `imports` list). Codegen
   * validates that every listed key exists in the merged scope at generation time.
   */
  readonly expose: readonly string[];
}

export interface ConfigSpec<TBeans extends Beans> {
  readonly imports?: readonly unknown[];
  readonly beans: TBeans;
  readonly postConstruct?: (
    beans: { readonly [K in keyof TBeans]: InferBeanValue<TBeans[K]> },
    config: unknown,
  ) => void;
  readonly preDestroy?: (
    beans: { readonly [K in keyof TBeans]: InferBeanValue<TBeans[K]> },
    config: unknown,
  ) => void;
}
