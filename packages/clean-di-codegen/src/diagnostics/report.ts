import pc from "picocolors";

import type { Diagnostic } from "./codes.js";
import { formatDiagnostic } from "./formatDiagnostic.js";

/**
 * Collects diagnostics during a codegen run, deduplicates by
 * `(code, file, line, column)`, and flushes them to a stream with optional
 * picocolors coloring (TTY-aware).
 *
 * Used by the CLI (W5) to drive exit code: any "error"-severity diagnostic
 * makes `hasErrors()` true, which means the CLI exits 1.
 *
 * All CDI-NNN codes in v1 are errors; CDIE-NNN codes are runtime only and not
 * collected here.
 */
export class DiagnosticReporter {
  private readonly entries: Diagnostic[] = [];
  private readonly seen = new Set<string>();

  /**
   * @param outStream Defaults to `process.stderr.write.bind(process.stderr)`.
   *                  Override for tests (or to redirect to a file).
   * @param isTty     Defaults to `process.stdout.isTTY ?? false`. When false,
   *                  colors are stripped from the output (CI logs stay plain).
   */
  constructor(
    private readonly write: (chunk: string) => void = (s: string) => {
      process.stderr.write(s);
    },
    private readonly isTty: boolean = process.stdout.isTTY === true,
  ) {}

  add(diagnostic: Diagnostic): void {
    const key = `${diagnostic.code} ${diagnostic.file} ${diagnostic.line} ${diagnostic.column}`;
    if (this.seen.has(key)) {
      return;
    }

    this.seen.add(key);
    this.entries.push(diagnostic);
  }

  flush(): void {
    for (const entry of this.entries) {
      const formatted = formatDiagnostic(entry);
      const colored = this.isTty ? this.applyColor(entry, formatted) : formatted;
      this.write(`${colored}\n`);
    }
  }

  hasErrors(): boolean {
    return this.entries.length > 0;
  }

  /** Test/integration convenience. Returns a defensive copy. */
  collected(): readonly Diagnostic[] {
    return [...this.entries];
  }

  private applyColor(d: Diagnostic, formatted: string): string {
    // Colorize the `error CDI-NNN:` token red, leave the rest alone.
    const codePattern = new RegExp(`(error ${d.code}:)`);
    return formatted.replace(codePattern, pc.red("$1"));
  }
}
