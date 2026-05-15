import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/clean-di/vitest.config.ts",
      "packages/clean-di-codegen/vitest.config.ts",
      "packages/clean-di-react/vitest.config.ts",
      "packages/clean-di-svelte/vitest.config.ts",
      "packages/clean-di-vue/vitest.config.ts",
      "examples/basic/vitest.config.ts",
      "examples/modular/vitest.config.ts",
      "examples/full-blog-app/vitest.config.ts",
    ],
  },
});
