import type { Plugin } from "vite";

import { runOnce, runWatch } from "../index.js";
import { VERSION } from "../version.js";

/**
 * Options for the clean-di Vite / Rollup plugins.
 *
 * Both `cwd` and `configPath` are forwarded to `runOnce` / `runWatch`. When
 * omitted, the plugin uses `process.cwd()` and the standard clean-di config
 * discovery (nearest `package.json` with a `cleanDi` field).
 */
export interface CleanDiPluginOptions {
  readonly cwd?: string;
  readonly configPath?: string;
}

/**
 * Vite plugin that runs clean-di codegen as part of the build.
 *
 * - `vite build`: runs `runOnce` at `buildStart`. Build fails if any
 *   diagnostic fires.
 * - `vite dev`: starts a `runWatch` watcher at `configureServer` time so that
 *   editing a `.di.ts` file regenerates the adjacent `.di.generated.ts` on
 *   save. The watcher is stopped at `closeBundle`.
 */
export function cleanDiVitePlugin(options: CleanDiPluginOptions = {}): Plugin {
  let watchStop: (() => Promise<void>) | undefined;

  return {
    name: "clean-di",
    async buildStart() {
      // In dev mode, configureServer has already started the watcher which
      // ran the initial one-shot pass; skip the duplicate runOnce here.
      if (watchStop !== undefined) {
        return;
      }
      const result = await runOnce({ ...options, generatorVersion: VERSION });
      if (result.exitCode !== 0) {
        this.error("clean-di codegen failed");
      }
    },
    async configureServer() {
      watchStop = await runWatch({ ...options, generatorVersion: VERSION });
    },
    async closeBundle() {
      if (watchStop !== undefined) {
        await watchStop();
        watchStop = undefined;
      }
    },
  };
}
