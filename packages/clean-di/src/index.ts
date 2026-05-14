/**
 * clean-di — public author-facing API.
 *
 * Generated files (`.di.generated.ts`) import from `clean-di/runtime` instead.
 * See DESIGN.md §6.4 for the rationale behind the split.
 */

export { defineContext } from "./public/defineContext.js";
export { defineConfig } from "./public/defineConfig.js";
export { provide } from "./public/provide.js";
export { bean } from "./public/bean.js";

export type { Container } from "./runtime/Container.js";
export type { BeanDef, ContextSpec, ConfigSpec } from "./public/types.js";
