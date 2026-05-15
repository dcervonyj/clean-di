import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect, afterEach } from "vitest";

import { runOnce } from "../../src/cli/main";
import { loadFixture } from "../util/loadFixture";

const UNAMBIGUOUS_FIXTURE = join(__dirname, "../fixtures/unambiguous");
const CDI007_FIXTURE = join(__dirname, "../fixtures/cdi-007-invalid-bean-def");
const MULTI_CONTEXT_FIXTURE = join(__dirname, "../fixtures/multi-context");

/** Write package.json + tsconfig so runOnce picks up root-level .di.ts files */
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

describe("runOnce", () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const fn of cleanups) await fn();
    cleanups.length = 0;
  });

  it("emits a .di.generated.ts for a valid fixture", async () => {
    const layout = await loadFixture(UNAMBIGUOUS_FIXTURE);
    cleanups.push(layout.cleanup);
    await writeTestConfig(layout.workDir);

    const messages: string[] = [];
    const result = await runOnce({
      cwd: layout.workDir,
      generatorVersion: "test-0.0.0",
      noColor: true,
      write: (s) => messages.push(s),
    });

    expect(result.exitCode).toBe(0);
    expect(result.filesProcessed).toBeGreaterThan(0);
    expect(result.filesWritten).toBeGreaterThan(0);
    expect(existsSync(join(layout.workDir, "input.di.generated.ts"))).toBe(true);
  });

  it("returns exitCode 1 when a diagnostic fires", async () => {
    // Use the cdi-007 fixture which has invalid bean entries (not bean() or provide())
    const layout = await loadFixture(CDI007_FIXTURE);
    cleanups.push(layout.cleanup);
    await writeTestConfig(layout.workDir);

    const result = await runOnce({
      cwd: layout.workDir,
      generatorVersion: "test-0.0.0",
      noColor: true,
    });

    expect(result.exitCode).toBe(1);
  });

  it("emits one per-context file for a multi-context .di.ts", async () => {
    const layout = await loadFixture(MULTI_CONTEXT_FIXTURE);
    cleanups.push(layout.cleanup);
    await writeTestConfig(layout.workDir);

    const result = await runOnce({
      cwd: layout.workDir,
      generatorVersion: "test-0.0.0",
      noColor: true,
    });

    expect(result.exitCode).toBe(0);
    // Both contexts must be written.
    expect(result.filesWritten).toBe(2);
    expect(existsSync(join(layout.workDir, "input.contextA.di.generated.ts"))).toBe(true);
    expect(existsSync(join(layout.workDir, "input.contextB.di.generated.ts"))).toBe(true);
  }, 15_000);

  it("returns filesProcessed=0 when no .di.ts files exist", async () => {
    const workDir = join(tmpdir(), `clean-di-empty-${Date.now()}`);
    cleanups.push(() => rm(workDir, { recursive: true, force: true }));
    await mkdir(workDir, { recursive: true });
    await writeTestConfig(workDir);

    const result = await runOnce({
      cwd: workDir,
      generatorVersion: "test-0.0.0",
      noColor: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.filesProcessed).toBe(0);
    expect(result.filesWritten).toBe(0);
  });
});
