import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    conditions: ["browser"],
  },
  test: {
    name: "clean-di-svelte",
    include: ["test/**/*.test.ts"],
    environment: "jsdom",
    globals: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: { lines: 85, functions: 85, branches: 75, statements: 85 },
      reporter: ["text", "html", "lcov"],
    },
  },
});
