import { describe, expect, it } from "vitest";

import type { Diagnostic } from "../../src/diagnostics/codes";
import { formatDiagnostic } from "../../src/diagnostics/formatDiagnostic";

describe("formatDiagnostic()", () => {
  it("formats a diagnostic without a hint", () => {
    const d: Diagnostic = {
      code: "CDI-001",
      file: "src/blog/PostsContext.di.ts",
      line: 14,
      column: 25,
      message: "UnresolvableDependency: no bean in scope matches the constructor parameter.",
    };

    expect(formatDiagnostic(d)).toBe(
      "src/blog/PostsContext.di.ts:14:25 - error CDI-001: " +
        "UnresolvableDependency: no bean in scope matches the constructor parameter.",
    );
  });

  it("appends a hint on a second indented line when present", () => {
    const d: Diagnostic = {
      code: "CDI-002",
      file: "src/x.di.ts",
      line: 7,
      column: 3,
      message: "AmbiguousDependency: two beans match.",
      hint: "Add a `bean(Class, { paramName: 'beanName' })` override.",
    };

    expect(formatDiagnostic(d)).toBe(
      "src/x.di.ts:7:3 - error CDI-002: AmbiguousDependency: two beans match.\n" +
        "  hint: Add a `bean(Class, { paramName: 'beanName' })` override.",
    );
  });

  it("treats an empty-string hint as absent", () => {
    const d: Diagnostic = {
      code: "CDI-003",
      file: "src/x.di.ts",
      line: 1,
      column: 1,
      message: "Cycle.",
      hint: "",
    };

    expect(formatDiagnostic(d)).toBe("src/x.di.ts:1:1 - error CDI-003: Cycle.");
  });

  it("matches the DESIGN §7.6 example shape", () => {
    // DESIGN §7.6 example: file:line:column with single-line + hint
    const d: Diagnostic = {
      code: "CDI-003",
      file: "src/blog/posts/PostsContext.di.ts",
      line: 14,
      column: 1,
      message: "CyclicDependency at src/blog/posts/PostsContext.di.ts:14",
      hint: "refactor to break the cycle, or move shared state to a third bean.",
    };
    const out = formatDiagnostic(d);
    expect(out.split("\n")).toHaveLength(2);
    expect(out).toContain("CDI-003");
    expect(out).toContain("hint:");
  });
});
