import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "clean-di-example-full-blog-app",
    include: ["test/**/*.test.ts"],
    globals: false,
  },
});
