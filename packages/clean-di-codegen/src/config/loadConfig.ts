import { readFile, access } from "node:fs/promises";
import { constants as FS_CONSTANTS } from "node:fs";
import { resolve as pathResolve, join as pathJoin } from "node:path";

import { createJiti } from "jiti";

import {
  defaultConfig,
  type CleanDiConfig,
  type ResolvedCleanDiConfig,
  type OutputMode,
} from "./defaultConfig.js";

/**
 * Resolve the codegen configuration from `cwd` (defaults to process.cwd()).
 *
 * Resolution order (highest priority first), per DESIGN §7.2:
 *   1. clean-di.config.ts
 *   2. clean-di.config.js
 *   3. clean-di.config.mjs
 *   4. `cleanDi` key in package.json
 *   5. defaultConfig
 *
 * The user's config is shallow-merged over `defaultConfig`. The `include` and
 * `exclude` arrays concatenate rather than replace.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<ResolvedCleanDiConfig> {
  const candidates = ["clean-di.config.ts", "clean-di.config.js", "clean-di.config.mjs"];

  for (const filename of candidates) {
    const filepath = pathJoin(cwd, filename);
    if (await fileExists(filepath)) {
      const userConfig = await loadConfigFile(filepath);
      return mergeConfig(userConfig);
    }
  }

  // Fallback: cleanDi key in package.json
  const pkgPath = pathJoin(cwd, "package.json");
  if (await fileExists(pkgPath)) {
    const pkgJson = JSON.parse(await readFile(pkgPath, "utf8")) as { cleanDi?: CleanDiConfig };
    if (pkgJson.cleanDi !== undefined) {
      return mergeConfig(pkgJson.cleanDi);
    }
  }

  return defaultConfig;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, FS_CONSTANTS.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadConfigFile(filepath: string): Promise<CleanDiConfig> {
  const jiti = createJiti(pathResolve(filepath));
  const mod = (await jiti.import(filepath)) as { default?: CleanDiConfig } | CleanDiConfig;
  if (isModuleWithDefault(mod)) {
    return mod.default ?? {};
  }
  return mod;
}

function isModuleWithDefault(m: unknown): m is { default?: CleanDiConfig } {
  return typeof m === "object" && m !== null && "default" in m;
}

function mergeConfig(user: CleanDiConfig): ResolvedCleanDiConfig {
  const output = (user.output ?? defaultConfig.output) as OutputMode;
  if (output !== "adjacent") {
    throw new Error(
      `clean-di-codegen: unsupported output mode "${output}". Only "adjacent" is supported in v1.`,
    );
  }

  return {
    include: [...defaultConfig.include, ...(user.include ?? [])],
    exclude: [...defaultConfig.exclude, ...(user.exclude ?? [])],
    tsconfig: user.tsconfig ?? defaultConfig.tsconfig,
    output,
    header: user.header ?? defaultConfig.header,
  };
}
