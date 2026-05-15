import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "clean-di-codegen",
    include: ["test/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/bin.ts"],
      thresholds: {
        lines: 85,
        functions: 85,
        // Complex TypeScript-analyzer branches (aliases, edge-case type flags,
        // unreachable chokidar event handlers, etc.) are not all reachable via
        // unit tests. 78% is the achievable floor with watch.ts included.
        branches: 78,
        statements: 85,
      },
      reporter: ["text", "html", "lcov"],
    },
  },
});
