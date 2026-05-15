import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "clean-di-example-basic",
    include: ["test/**/*.test.ts"],
    globals: false,
  },
});
