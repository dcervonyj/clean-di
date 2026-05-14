/**
 * clean-di — public author-facing API.
 *
 * Generated files (`.di.generated.ts`) import from `clean-di/runtime` instead.
 * See DESIGN.md §6.4 for the rationale behind the split.
 */

export { defineContext } from "./public/defineContext";
export { defineConfig } from "./public/defineConfig";
export { provide } from "./public/provide";
export { bean } from "./public/bean";

export type { Container } from "./runtime/Container";
export type { BeanDef, ContextSpec, ConfigSpec } from "./public/types";
