import type { Beans, ConfigSpec } from "./types.js";

declare const DEFINED_CONFIG_BRAND: unique symbol;

/**
 * Branded marker representing a reusable sub-config module. Distinct from `BeanDef`
 * so the analyzer can tell them apart when emitting diagnostic CDI-010
 * (InvalidImport: an `imports` entry must be a `defineConfig` result, not a `bean()`).
 */
export interface DefinedConfig<TBeans extends Beans> {
  readonly [DEFINED_CONFIG_BRAND]: TBeans;
  readonly spec: ConfigSpec<TBeans>;
}

/**
 * Declare a reusable bean module. The returned value is `import`ed by parent contexts
 * via `imports: [...]`. Codegen reads the spec's `beans` field when building the
 * transitive bean scope; nothing here runs at runtime.
 */
export function defineConfig<TBeans extends Beans>(
  spec: ConfigSpec<TBeans>,
): DefinedConfig<TBeans> {
  return { spec } as DefinedConfig<TBeans>;
}
