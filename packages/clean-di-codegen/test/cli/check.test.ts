import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, it, expect, afterEach } from "vitest";

import { runCheck } from "../../src/cli/check";
import { runOnce } from "../../src/cli/main";
import { loadFixture } from "../util/loadFixture";

const UNAMBIGUOUS_FIXTURE = join(__dirname, "../fixtures/unambiguous");

async function writeTestConfig(dir: string): Promise<void> {
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

describe("runCheck", () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const fn of cleanups) await fn();
    cleanups.length = 0;
  });

  it("returns exitCode 0 when generated file is up-to-date", async () => {
    const layout = await loadFixture(UNAMBIGUOUS_FIXTURE);
    cleanups.push(layout.cleanup);
    await writeTestConfig(layout.workDir);

    // First: run once to produce the generated file.
    await runOnce({
      cwd: layout.workDir,
      generatorVersion: "test-0.0.0",
      noColor: true,
    });

    // Then: run check — should pass.
    const result = await runCheck({
      cwd: layout.workDir,
      generatorVersion: "test-0.0.0",
      noColor: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.staleFiles).toHaveLength(0);
  });

  it("returns exitCode 1 when generated file is missing", async () => {
    const layout = await loadFixture(UNAMBIGUOUS_FIXTURE);
    cleanups.push(layout.cleanup);
    await writeTestConfig(layout.workDir);

    // No .di.generated.ts committed — check must flag as stale.
    const staleMessages: string[] = [];
    const result = await runCheck({
      cwd: layout.workDir,
      generatorVersion: "test-0.0.0",
      noColor: true,
      write: (s) => staleMessages.push(s),
    });

    expect(result.exitCode).toBe(1);
    expect(result.staleFiles.length).toBeGreaterThan(0);
    expect(staleMessages.some((m) => m.includes("stale"))).toBe(true);
  });

  it("returns exitCode 1 when generated file is outdated", async () => {
    const layout = await loadFixture(UNAMBIGUOUS_FIXTURE);
    cleanups.push(layout.cleanup);
    await writeTestConfig(layout.workDir);

    // Write a wrong/outdated content into the generated file
    const generatedPath = join(layout.workDir, "input.di.generated.ts");
    await writeFile(generatedPath, "// outdated content\n");

    const result = await runCheck({
      cwd: layout.workDir,
      generatorVersion: "test-0.0.0",
      noColor: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.staleFiles).toContain(generatedPath);
  });
});
