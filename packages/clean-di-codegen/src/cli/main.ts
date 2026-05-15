import { dirname, resolve as pathResolve } from "node:path";

import * as ts from "typescript";

import type { ResolvedCleanDiConfig } from "../config/defaultConfig.js";
import { loadConfig } from "../config/loadConfig.js";
import { DiagnosticReporter } from "../diagnostics/report.js";
import { emitGeneratedFile } from "../emitter/emitGeneratedFile.js";

export interface RunOnceOptions {
  readonly cwd?: string;
  /** Explicit path to a clean-di config file; its directory is used for config lookup. */
  readonly configPath?: string;
  readonly generatorVersion: string;
  readonly noColor?: boolean;
  /** Override output stream (defaults to `process.stderr.write`). */
  readonly write?: (chunk: string) => void;
}

export interface RunOnceResult {
  readonly exitCode: number;
  readonly filesProcessed: number;
  readonly filesWritten: number;
}

/**
 * One-shot codegen: glob all `.di.ts` files, build a `ts.Program`, call
 * `emitGeneratedFile` for each file, flush diagnostics, return exit code.
 *
 * Returns `exitCode: 0` on success, `exitCode: 1` if any diagnostic fired.
 */
export async function runOnce(options: RunOnceOptions): Promise<RunOnceResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await loadConfig(
    options.configPath !== undefined ? dirname(pathResolve(cwd, options.configPath)) : cwd,
  );

  const reporter = new DiagnosticReporter(
    options.write,
    options.noColor === true ? false : process.stdout.isTTY === true,
  );

  const { diFiles, program } = buildProgram(cwd, config);

  if (diFiles.length === 0) {
    return { exitCode: 0, filesProcessed: 0, filesWritten: 0 };
  }

  let filesWritten = 0;
  for (const filePath of diFiles) {
    filesWritten += await emitAllContexts(filePath, program, reporter, options.generatorVersion);
  }

  reporter.flush();
  return {
    exitCode: reporter.hasErrors() ? 1 : 0,
    filesProcessed: diFiles.length,
    filesWritten,
  };
}

/**
 * Emit all well-formed contexts in a single `.di.ts` file.
 *
 * When the file has exactly one context the existing single-file output path
 * (`X.di.generated.ts`) is used for backward compatibility. When there are N>1
 * contexts each gets its own `X.<varName>.di.generated.ts` file.
 *
 * Returns the number of files written.
 */
export async function emitAllContexts(
  sourcePath: string,
  program: ts.Program,
  reporter: DiagnosticReporter,
  generatorVersion: string,
): Promise<number> {
  // First call discovers the context list (contextIndex 0).
  const first = await emitGeneratedFile({
    sourcePath,
    program,
    reporter,
    generatorVersion,
    contextIndex: 0,
  });

  let written = first.wrote ? 1 : 0;

  // If the file contains more than one context, emit the rest.
  for (let i = 1; i < first.allContextNames.length; i++) {
    const result = await emitGeneratedFile({
      sourcePath,
      program,
      reporter,
      generatorVersion,
      contextIndex: i,
    });
    if (result.wrote) {
      written++;
    }
  }

  return written;
}

/**
 * Locate all `.di.ts` files matching the clean-di config's include/exclude
 * patterns and build a `ts.Program` rooted at them.
 *
 * Exported so `watch.ts` and `check.ts` can rebuild after file changes.
 */
export function buildProgram(
  cwd: string,
  config: ResolvedCleanDiConfig,
): { diFiles: string[]; program: ts.Program } {
  const diFiles = ts.sys.readDirectory(
    cwd,
    [".ts"],
    config.exclude as string[],
    config.include as string[],
  );

  const tsconfigPath = pathResolve(cwd, config.tsconfig);
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config as Record<string, unknown>,
    ts.sys,
    dirname(tsconfigPath),
  );

  const program = ts.createProgram({
    rootNames: diFiles.length > 0 ? diFiles : [tsconfigPath],
    options: parsedConfig.options,
  });

  return { diFiles, program };
}
