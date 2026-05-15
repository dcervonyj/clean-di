import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "clean-di-react",
    include: ["test/**/*.test.tsx", "test/**/*.test.ts"],
    environment: "jsdom",
    globals: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.d.ts"],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85,
      },
      reporter: ["text", "html", "lcov"],
    },
  },
});
