import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/clean-di/vitest.config.ts",
  "packages/clean-di-codegen/vitest.config.ts",
  "examples/basic/vitest.config.ts",
  "examples/modular/vitest.config.ts",
  "examples/full-blog-app/vitest.config.ts",
]);
