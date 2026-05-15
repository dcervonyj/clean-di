import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    name: "clean-di-vue",
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
