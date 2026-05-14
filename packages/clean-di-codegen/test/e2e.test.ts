import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DiagnosticReporter } from "../src/diagnostics/report";
import { emitGeneratedFile } from "../src/emitter/emitGeneratedFile";

import { loadFixture, matchesExpected } from "./util/loadFixture";

const FIXTURES_ROOT = join(__dirname, "fixtures");

interface FixtureCase {
  readonly name: string;
  readonly path: string;
  readonly isNegative: boolean;
}

async function enumerateFixtures(): Promise<readonly FixtureCase[]> {
  const cases: FixtureCase[] = [];
  const topLevel = await readdir(FIXTURES_ROOT);

  for (const entry of topLevel) {
    const entryPath = join(FIXTURES_ROOT, entry);
    const st = await stat(entryPath);
    if (!st.isDirectory()) {
      continue;
    }

    // Some fixtures have sub-directories per scenario (e.g., cdi-005, cdi-008).
    // Detect by looking for input.di.ts at top level vs nested.
    const children = await readdir(entryPath);
    if (children.includes("input.di.ts")) {
      cases.push({
        name: entry,
        path: entryPath,
        isNegative: entry.startsWith("cdi-"),
      });
      continue;
    }

    for (const sub of children) {
      const subPath = join(entryPath, sub);
      const subSt = await stat(subPath);
      if (!subSt.isDirectory()) {
        continue;
      }
      const subChildren = await readdir(subPath);
      if (subChildren.includes("input.di.ts")) {
        cases.push({
          name: `${entry}/${sub}`,
          path: subPath,
          isNegative: entry.startsWith("cdi-"),
        });
      }
    }
  }

  return cases;
}

describe("e2e fixture catalog (T-053)", async () => {
  const cases = await enumerateFixtures();

  it("discovers at least 16 fixture cases (6 positive + 10 negative scenarios, plus sub-cases)", () => {
    expect(cases.length).toBeGreaterThanOrEqual(16);
  });

  for (const fixture of cases) {
    if (fixture.isNegative) {
      it(`[negative] ${fixture.name} — emits expected diagnostics`, async () => {
        const layout = await loadFixture(fixture.path);
        try {
          const reporter = new DiagnosticReporter(() => {}, false);
          const result = await emitGeneratedFile({
            sourcePath: layout.inputPath,
            program: layout.program,
            reporter,
            generatorVersion: "1.0.0",
          });

          // Negative fixtures must NOT write a generated file.
          expect(result.wrote).toBe(false);

          const expected = layout.expectedDiagnostics;
          if (expected !== undefined) {
            const match = matchesExpected(reporter.collected(), expected);
            expect(match.ok, match.reason).toBe(true);
          } else {
            // No expected-diagnostics.json — at minimum we expect SOMETHING fired.
            expect(reporter.hasErrors()).toBe(true);
          }
        } finally {
          await layout.cleanup();
        }
      });
    } else {
      it(`[positive] ${fixture.name} — emits a generated file with no errors`, async () => {
        const layout = await loadFixture(fixture.path);
        try {
          const reporter = new DiagnosticReporter(() => {}, false);
          const result = await emitGeneratedFile({
            sourcePath: layout.inputPath,
            program: layout.program,
            reporter,
            generatorVersion: "1.0.0",
          });

          if (!result.wrote) {
            // Surface the diagnostics for debugging.
            // eslint-disable-next-line no-console
            console.error(
              `Fixture ${fixture.name} diagnostics:`,
              JSON.stringify(reporter.collected(), null, 2),
            );
          }
          expect(result.wrote).toBe(true);
          expect(reporter.hasErrors()).toBe(false);

          // P0-C: byte-for-byte snapshot comparison.
          const generated = await readFile(result.outputPath, "utf8");
          await expect(generated).toMatchFileSnapshot(
            join(layout.fixturePath, "expected.di.generated.ts"),
          );
        } finally {
          await layout.cleanup();
        }
      });
    }
  }
});
