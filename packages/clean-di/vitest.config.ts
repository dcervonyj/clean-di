import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "clean-di",
    root: ".",
    include: ["test/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 95,
        statements: 100,
      },
      reporter: ["text", "html", "lcov"],
    },
  },
});
