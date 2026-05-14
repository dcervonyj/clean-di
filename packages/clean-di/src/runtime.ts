/**
 * clean-di runtime — secondary entry consumed only by `.di.generated.ts` files.
 *
 * Author code imports from `clean-di` (the default entry). Generated files
 * import from `clean-di/runtime`. Splitting the two keeps the public author
 * surface minimal (DESIGN §6.4) while exposing the internal `createContext`
 * engine that generated files need.
 */

export { createContext } from "./runtime/createContext";
export type { BuildResult } from "./runtime/buildResult";
