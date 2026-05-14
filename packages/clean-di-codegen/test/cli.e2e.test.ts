/**
 * CLI e2e tests — T-063.
 *
 * Tests `runOnce` and `runCheck` (the CLI entry-point drivers) against every
 * fixture in `test/fixtures/`. Positive fixtures must emit with exitCode 0;
 * negative fixtures (cdi-NNN-*) must return exitCode 1.  A follow-up `runCheck`
 * after a successful `runOnce` must also return exitCode 0.
 */
import { readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCheck } from "../src/cli/check";
import { runOnce } from "../src/cli/main";

import { loadFixture } from "./util/loadFixture";

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
    if (!st.isDirectory()) continue;

    const children = await readdir(entryPath);
    if (children.includes("input.di.ts")) {
      cases.push({ name: entry, path: entryPath, isNegative: entry.startsWith("cdi-") });
      continue;
    }

    for (const sub of children) {
      const subPath = join(entryPath, sub);
      const subSt = await stat(subPath);
      if (!subSt.isDirectory()) continue;
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

async function writeCliConfig(dir: string): Promise<void> {
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "test",
      cleanDi: { include: ["**/*.di.ts"], exclude: ["**/node_modules/**"] },
    }),
  );
  await writeFile(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: false,
        skipLibCheck: true,
        baseUrl: ".",
      },
    }),
  );
}

const fixtures = await enumerateFixtures();
const positiveFixtures = fixtures.filter((f) => !f.isNegative);
const negativeFixtures = fixtures.filter((f) => f.isNegative);

describe("CLI e2e — runOnce", () => {
  for (const fixture of positiveFixtures) {
    it(`[positive] ${fixture.name} — exits 0 and writes a generated file`, async () => {
      const layout = await loadFixture(fixture.path);
      try {
        await writeCliConfig(layout.workDir);
        const result = await runOnce({
          cwd: layout.workDir,
          generatorVersion: "e2e-test",
          noColor: true,
        });
        expect(result.exitCode, `exitCode for ${fixture.name}`).toBe(0);
        expect(result.filesProcessed, `filesProcessed for ${fixture.name}`).toBeGreaterThan(0);
        expect(result.filesWritten, `filesWritten for ${fixture.name}`).toBeGreaterThan(0);
      } finally {
        await layout.cleanup();
      }
    });
  }

  for (const fixture of negativeFixtures) {
    it(`[negative] ${fixture.name} — exits 1 with diagnostics`, async () => {
      const layout = await loadFixture(fixture.path);
      try {
        await writeCliConfig(layout.workDir);
        const result = await runOnce({
          cwd: layout.workDir,
          generatorVersion: "e2e-test",
          noColor: true,
        });
        expect(result.exitCode, `exitCode for ${fixture.name}`).toBe(1);
      } finally {
        await layout.cleanup();
      }
    });
  }
});

describe("CLI e2e — runCheck", () => {
  it("returns exitCode 0 after a successful runOnce on a positive fixture", async () => {
    const layout = await loadFixture(join(FIXTURES_ROOT, "unambiguous"));
    try {
      await writeCliConfig(layout.workDir);
      const onceResult = await runOnce({
        cwd: layout.workDir,
        generatorVersion: "e2e-test",
        noColor: true,
      });
      expect(onceResult.exitCode).toBe(0);

      const checkResult = await runCheck({
        cwd: layout.workDir,
        generatorVersion: "e2e-test",
        noColor: true,
      });
      expect(checkResult.exitCode).toBe(0);
      expect(checkResult.staleFiles).toHaveLength(0);
    } finally {
      await layout.cleanup();
    }
  });

  it("returns exitCode 1 when generated files are missing", async () => {
    const layout = await loadFixture(join(FIXTURES_ROOT, "unambiguous"));
    try {
      await writeCliConfig(layout.workDir);
      const checkResult = await runCheck({
        cwd: layout.workDir,
        generatorVersion: "e2e-test",
        noColor: true,
      });
      expect(checkResult.exitCode).toBe(1);
    } finally {
      await layout.cleanup();
    }
  });
});
