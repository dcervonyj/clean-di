import { dirname, resolve as pathResolve } from "node:path";

import * as ts from "typescript";

import { loadConfig } from "../config/loadConfig.js";
import { DiagnosticReporter } from "../diagnostics/report.js";
import { emitGeneratedFile } from "../emitter/emitGeneratedFile.js";

import { buildProgram } from "./main.js";

export interface RunCheckOptions {
  readonly cwd?: string;
  readonly configPath?: string;
  readonly generatorVersion: string;
  readonly noColor?: boolean;
  readonly write?: (chunk: string) => void;
}

export interface RunCheckResult {
  readonly exitCode: number;
  /** Paths of generated files that are stale or missing. */
  readonly staleFiles: readonly string[];
}

/**
 * Check mode: runs the full codegen pipeline in-memory (dryRun) without
 * writing any files. For each `.di.ts`, compares the would-be-generated
 * content against the committed `.di.generated.ts`. Any mismatch or missing
 * file causes `exitCode: 1` (DESIGN §7.9).
 *
 * Intended as a CI gate: run after committing to catch forgotten regenerations.
 */
export async function runCheck(options: RunCheckOptions): Promise<RunCheckResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await loadConfig(
    options.configPath !== undefined ? dirname(pathResolve(cwd, options.configPath)) : cwd,
  );

  const log = options.write ?? ((s: string) => process.stderr.write(s));

  const reporter = new DiagnosticReporter(
    options.write,
    options.noColor === true ? false : process.stdout.isTTY === true,
  );

  const { diFiles, program } = buildProgram(cwd, config);

  const staleFiles: string[] = [];

  for (const filePath of diFiles) {
    const fileStaleFiles = await checkAllContexts(
      filePath,
      program,
      reporter,
      options.generatorVersion,
    );
    for (const stalePath of fileStaleFiles) {
      staleFiles.push(stalePath);
      log(`✗ stale: ${stalePath}\n`);
    }
  }

  reporter.flush();

  return {
    exitCode: staleFiles.length > 0 || reporter.hasErrors() ? 1 : 0,
    staleFiles,
  };
}

/**
 * Run a dry-run check for all well-formed contexts in a single `.di.ts` file.
 *
 * Mirrors the multi-context logic in `emitAllContexts` from `main.ts` but uses
 * `dryRun: true` so nothing is written. Returns the paths of any stale or
 * missing generated files.
 */
async function checkAllContexts(
  sourcePath: string,
  program: ts.Program,
  reporter: DiagnosticReporter,
  generatorVersion: string,
): Promise<readonly string[]> {
  // First call discovers the context list (contextIndex 0).
  const first = await emitGeneratedFile({
    sourcePath,
    program,
    reporter,
    generatorVersion,
    contextIndex: 0,
    dryRun: true,
  });

  const stale: string[] = [];
  if (first.stale) {
    stale.push(first.outputPath);
  }

  // If the file contains more than one context, check the rest.
  for (let i = 1; i < first.allContextNames.length; i++) {
    const result = await emitGeneratedFile({
      sourcePath,
      program,
      reporter,
      generatorVersion,
      contextIndex: i,
      dryRun: true,
    });
    if (result.stale) {
      stale.push(result.outputPath);
    }
  }

  return stale;
}
