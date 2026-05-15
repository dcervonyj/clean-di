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
        // unreachable chokidar event handlers, defensive symbol-undefined
        // guards in collectConfigTypeImport, etc.) are not all reachable via
        // unit tests. 77% is the achievable floor with watch.ts included.
        branches: 77,
        statements: 85,
      },
      reporter: ["text", "html", "lcov"],
    },
  },
});
