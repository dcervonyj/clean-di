import type { Diagnostic } from "./codes.js";

/**
 * Format a diagnostic as a single multi-line string in standard TS-diagnostic
 * style. NO color codes — coloring is layered on by the reporter for TTY output.
 *
 * Format:
 *   <file>:<line>:<column> - error <CODE>: <message>
 *     hint: <optional hint>
 */
export function formatDiagnostic(d: Diagnostic): string {
  const head = `${d.file}:${d.line}:${d.column} - error ${d.code}: ${d.message}`;
  if (d.hint === undefined || d.hint.length === 0) {
    return head;
  }

  return `${head}\n  hint: ${d.hint}`;
}
