import { describe, expect, it } from "vitest";

import type { Diagnostic } from "../../src/diagnostics/codes";
import { DiagnosticReporter } from "../../src/diagnostics/report";

const mkDiag = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  code: "CDI-001",
  file: "src/x.di.ts",
  line: 1,
  column: 1,
  message: "test message",
  ...overrides,
});

describe("DiagnosticReporter", () => {
  it("accumulates diagnostics", () => {
    const reporter = new DiagnosticReporter(() => {}, false);
    reporter.add(mkDiag({ code: "CDI-001" }));
    reporter.add(mkDiag({ code: "CDI-002", line: 2 }));

    expect(reporter.hasErrors()).toBe(true);
    expect(reporter.collected()).toHaveLength(2);
  });

  it("deduplicates by (code, file, line, column)", () => {
    const reporter = new DiagnosticReporter(() => {}, false);
    reporter.add(mkDiag({ code: "CDI-001", line: 5, column: 3 }));
    reporter.add(mkDiag({ code: "CDI-001", line: 5, column: 3 }));
    reporter.add(mkDiag({ code: "CDI-001", line: 5, column: 4 })); // different column → new entry

    expect(reporter.collected()).toHaveLength(2);
  });

  it("does NOT deduplicate diagnostics with different codes at the same location", () => {
    const reporter = new DiagnosticReporter(() => {}, false);
    reporter.add(mkDiag({ code: "CDI-001", line: 5, column: 3 }));
    reporter.add(mkDiag({ code: "CDI-002", line: 5, column: 3 }));

    expect(reporter.collected()).toHaveLength(2);
  });

  it("hasErrors() is false when nothing was added", () => {
    const reporter = new DiagnosticReporter(() => {}, false);
    expect(reporter.hasErrors()).toBe(false);
  });

  it("flush() writes each diagnostic followed by a newline", () => {
    const lines: string[] = [];
    const reporter = new DiagnosticReporter((s) => lines.push(s), false);

    reporter.add(mkDiag({ code: "CDI-001", message: "first" }));
    reporter.add(mkDiag({ code: "CDI-002", message: "second", line: 2 }));
    reporter.flush();

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("CDI-001");
    expect(lines[0]).toContain("first");
    expect(lines[0]).toMatch(/\n$/);
    expect(lines[1]).toContain("CDI-002");
  });

  it("flush() is colorless when isTty=false (CI mode)", () => {
    const lines: string[] = [];
    const reporter = new DiagnosticReporter((s) => lines.push(s), false);
    reporter.add(mkDiag());
    reporter.flush();

    // ANSI escape sequences begin with [ — none should appear.
    expect(lines[0]).not.toMatch(/\[/);
  });

  it("flush() colorizes the error code when isTty=true", () => {
    const lines: string[] = [];
    const reporter = new DiagnosticReporter((s) => lines.push(s), true);
    reporter.add(mkDiag({ code: "CDI-001" }));
    reporter.flush();

    // Red ANSI sequence wraps the `error CDI-001:` token.
    expect(lines[0]).toMatch(/\[31m.*error CDI-001:.*\[/);
  });

  it("collected() returns a defensive copy (mutating it does not affect internal state)", () => {
    const reporter = new DiagnosticReporter(() => {}, false);
    reporter.add(mkDiag());

    const copy = reporter.collected() as Diagnostic[];
    copy.push(mkDiag({ line: 99 }));

    expect(reporter.collected()).toHaveLength(1);
  });
});
