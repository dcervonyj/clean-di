import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "clean-di",
    include: ["test/**/*.test.ts", "test/**/*.test-d.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Exclude type-only and re-export files: v8 counts them as 0% because they
      // have no executable statements. Coverage is enforced on runtime logic only.
      exclude: [
        "src/**/*.d.ts",
        "src/public/types.ts",
        "src/runtime/buildResult.ts",
        "src/runtime/Container.ts",
        "src/runtime.ts",
      ],
      thresholds: {
        lines: 95,
        functions: 100,
        branches: 90,
        statements: 95,
      },
      reporter: ["text", "html", "lcov"],
    },
  },
});
