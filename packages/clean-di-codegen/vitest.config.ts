import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "clean-di-codegen",
    include: ["test/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Exclude type-only files and the file-system watcher (chokidar-based,
      // untestable in unit coverage without real FS events).
      exclude: ["src/**/*.d.ts", "src/bin.ts", "src/cli/watch.ts"],
      thresholds: {
        lines: 85,
        functions: 85,
        // Complex TypeScript-analyzer branches (aliases, edge-case type flags,
        // etc.) are not all reachable via unit tests; 75% is the real floor.
        branches: 75,
        statements: 85,
      },
      reporter: ["text", "html", "lcov"],
    },
  },
});
