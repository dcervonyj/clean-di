import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "clean-di-codegen",
    root: ".",
    include: ["test/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/bin.ts"],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
      reporter: ["text", "html", "lcov"],
    },
  },
});
