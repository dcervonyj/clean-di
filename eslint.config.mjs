import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";

export default tseslint.config(
  // global ignores
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/*.di.generated.ts",
      "**/*.js",
      "**/*.d.ts",
    ],
  },
  // recommended base + typescript-eslint recommended
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      import: importPlugin,
      "unused-imports": unusedImports,
    },
    settings: {
      "import/resolver": {
        typescript: { project: ["./packages/*/tsconfig.json"] },
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "prefer-const": "error",
      "no-var": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "parent", "sibling", "index"],
          "newlines-between": "always",
          alphabetize: { order: "asc" },
        },
      ],
    },
  },
);
