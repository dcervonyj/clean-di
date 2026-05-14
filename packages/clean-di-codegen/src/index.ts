/**
 * Programmatic API for clean-di-codegen.
 *
 * Consumers can embed the codegen in their own build scripts rather than
 * spawning the CLI as a child process.
 *
 * @example
 * ```ts
 * import { runOnce } from "clean-di-codegen";
 * const { exitCode } = await runOnce({ generatorVersion: "1.0.0" });
 * ```
 */
export { runOnce } from "./cli/main.js";
export type { RunOnceOptions, RunOnceResult } from "./cli/main.js";

export { runWatch } from "./cli/watch.js";
export type { RunWatchOptions } from "./cli/watch.js";

export { runCheck } from "./cli/check.js";
export type { RunCheckOptions, RunCheckResult } from "./cli/check.js";

export type { CliArgs, CliMode } from "./cli/args.js";

export type { Diagnostic, DiagnosticCode } from "./diagnostics/codes.js";

export { VERSION } from "./version.js";
