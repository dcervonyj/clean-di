import { dirname, resolve as pathResolve } from "node:path";

import { watch as chokidarWatch } from "chokidar";

import { loadConfig } from "../config/loadConfig.js";
import { DiagnosticReporter } from "../diagnostics/report.js";
import { emitGeneratedFile } from "../emitter/emitGeneratedFile.js";

import { buildProgram } from "./main.js";

export interface RunWatchOptions {
  readonly cwd?: string;
  readonly configPath?: string;
  readonly generatorVersion: string;
  readonly noColor?: boolean;
  readonly write?: (chunk: string) => void;
  /** Called once after the initial scan completes (before watching begins). */
  readonly onReady?: () => void;
  /** Called each time a file is successfully emitted. For testing. */
  readonly onEmit?: (filePath: string) => void;
  /**
   * Test-only: called after the initial pass with a reference to
   * `processChanged`. Tests can invoke `processChanged()` directly to simulate
   * a file-change cycle without relying on chokidar's FS event delivery (which
   * is unreliable in tmpdir on macOS).
   */
  readonly _triggerChange?: (processChanged: () => Promise<void>) => void;
}

/**
 * Watch mode: runs an initial one-shot pass then watches the include globs
 * using chokidar. Changes are debounced (50 ms). Errors are logged but do NOT
 * kill the watcher (DESIGN §7.7).
 *
 * Returns an async cleanup function that stops the watcher.
 */
export async function runWatch(options: RunWatchOptions): Promise<() => Promise<void>> {
  const cwd = options.cwd ?? process.cwd();
  const config = await loadConfig(
    options.configPath !== undefined ? dirname(pathResolve(cwd, options.configPath)) : cwd,
  );

  const logError = options.write ?? ((s: string) => process.stderr.write(s));

  function makeReporter(): DiagnosticReporter {
    return new DiagnosticReporter(
      options.write,
      options.noColor === true ? false : process.stdout.isTTY === true,
    );
  }

  async function emitFile(
    filePath: string,
    program: ReturnType<typeof buildProgram>["program"],
  ): Promise<void> {
    const reporter = makeReporter();
    try {
      await emitGeneratedFile({
        sourcePath: filePath,
        program,
        reporter,
        generatorVersion: options.generatorVersion,
      });
      reporter.flush();
      options.onEmit?.(filePath);
    } catch (err) {
      reporter.flush();
      logError(`clean-di-codegen: error processing ${filePath}: ${String(err)}\n`);
    }
  }

  // Initial full pass.
  const { diFiles, program: initialProgram } = buildProgram(cwd, config);
  for (const filePath of diFiles) {
    await emitFile(filePath, initialProgram);
  }

  // Start file watcher.
  const watcher = chokidarWatch(config.include as string[], {
    cwd,
    ignored: config.exclude as string[],
    persistent: true,
    ignoreInitial: true,
  });

  const pending = new Set<string>();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  async function processChanged(): Promise<void> {
    pending.clear();
    const { diFiles: allDiFiles, program } = buildProgram(cwd, config);
    for (const filePath of allDiFiles) {
      await emitFile(filePath, program);
    }
  }

  function scheduleChange(relativePath: string): void {
    pending.add(pathResolve(cwd, relativePath));
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      processChanged().catch((err: unknown) => {
        logError(`clean-di-codegen: watch error: ${String(err)}\n`);
      });
    }, 50);
  }

  watcher.on("add", scheduleChange);
  watcher.on("change", scheduleChange);
  watcher.on("unlink", scheduleChange);
  watcher.on("ready", () => {
    options.onReady?.();
    options._triggerChange?.(processChanged);
  });

  return async () => {
    clearTimeout(debounceTimer);
    await watcher.close();
  };
}
