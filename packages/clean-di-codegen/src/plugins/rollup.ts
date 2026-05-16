import type { Plugin } from "rollup";

import { runOnce } from "../index.js";
import { VERSION } from "../version.js";

import type { CleanDiPluginOptions } from "./vite.js";

export type { CleanDiPluginOptions } from "./vite.js";

/**
 * Rollup plugin that runs clean-di codegen at `buildStart`.
 *
 * Rollup has no equivalent of Vite's `configureServer`, so this plugin only
 * runs the one-shot codegen pass. Build fails if any diagnostic fires.
 */
export function cleanDiRollupPlugin(options: CleanDiPluginOptions = {}): Plugin {
  return {
    name: "clean-di",
    async buildStart() {
      const result = await runOnce({ ...options, generatorVersion: VERSION });
      if (result.exitCode !== 0) {
        this.error("clean-di codegen failed");
      }
    },
  };
}
