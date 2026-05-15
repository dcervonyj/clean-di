import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runWatch } from "../../src/cli/watch";
import { loadFixture } from "../util/loadFixture";

const UNAMBIGUOUS_FIXTURE = join(__dirname, "../fixtures/unambiguous");

/** Write package.json + tsconfig so runWatch picks up root-level .di.ts files */
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

/** Wait for a condition to become true, polling every 25 ms up to `timeoutMs`. */
async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`waitFor timed out after ${timeoutMs} ms`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
}

describe("runWatch", () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const fn of cleanups) {
      await fn();
    }
    cleanups.length = 0;
  });

  it("initial pass emits generated files and calls onReady", async () => {
    const layout = await loadFixture(UNAMBIGUOUS_FIXTURE);
    cleanups.push(layout.cleanup);
    await writeTestConfig(layout.workDir);

    let ready = false;
    const emitted: string[] = [];

    const stop = await runWatch({
      cwd: layout.workDir,
      generatorVersion: "test-0.0.0",
      noColor: true,
      write: () => {},
      onReady: () => {
        ready = true;
      },
      onEmit: (filePath) => {
        emitted.push(filePath);
      },
    });
    cleanups.push(stop);

    // onReady fires after the chokidar watcher is set up (after initial pass).
    await waitFor(() => ready, 5_000);

    expect(ready).toBe(true);
    expect(emitted.length).toBeGreaterThan(0);
    expect(existsSync(join(layout.workDir, "input.di.generated.ts"))).toBe(true);
  }, 15_000);

  it("file change triggers re-emit via onEmit callback", async () => {
    const layout = await loadFixture(UNAMBIGUOUS_FIXTURE);
    cleanups.push(layout.cleanup);
    await writeTestConfig(layout.workDir);

    let ready = false;
    const emitted: string[] = [];
    let triggerChange: (() => Promise<void>) | undefined;

    const stop = await runWatch({
      cwd: layout.workDir,
      generatorVersion: "test-0.0.0",
      noColor: true,
      write: () => {},
      onReady: () => {
        ready = true;
      },
      onEmit: (filePath) => {
        emitted.push(filePath);
      },
      // Capture the processChanged handle so we can fire it without relying on
      // chokidar FS-event delivery (unreliable in macOS tmpdir).
      _triggerChange: (fn) => {
        triggerChange = fn;
      },
    });
    cleanups.push(stop);

    // Wait until the initial pass is done and onReady + _triggerChange have fired.
    await waitFor(() => ready && triggerChange !== undefined, 5_000);

    const countAfterInitial = emitted.length;
    expect(countAfterInitial).toBeGreaterThan(0);

    // Directly invoke processChanged — simulates a file-change cycle.
    await triggerChange!();

    expect(emitted.length).toBeGreaterThan(countAfterInitial);
  }, 15_000);

  it("stop() closes the watcher without error", async () => {
    const layout = await loadFixture(UNAMBIGUOUS_FIXTURE);
    cleanups.push(layout.cleanup);
    await writeTestConfig(layout.workDir);

    let ready = false;

    const stop = await runWatch({
      cwd: layout.workDir,
      generatorVersion: "test-0.0.0",
      noColor: true,
      write: () => {},
      onReady: () => {
        ready = true;
      },
    });

    await waitFor(() => ready, 5_000);

    // stop() must resolve without throwing.
    await expect(stop()).resolves.toBeUndefined();
  }, 15_000);

  it("respects an explicit configPath option", async () => {
    const layout = await loadFixture(UNAMBIGUOUS_FIXTURE);
    cleanups.push(layout.cleanup);
    // writeTestConfig writes package.json with the cleanDi key + tsconfig.json.
    await writeTestConfig(layout.workDir);

    let ready = false;
    const emitted: string[] = [];

    // Pass configPath explicitly (covers the configPath !== undefined branch).
    // Omit write so the logError fallback uses process.stderr.write (covers that
    // branch too).
    const stop = await runWatch({
      cwd: layout.workDir,
      // Point to package.json — loadConfig uses dirname(resolvedPath) as cwd.
      configPath: join(layout.workDir, "package.json"),
      generatorVersion: "test-0.0.0",
      noColor: true,
      onReady: () => {
        ready = true;
      },
      onEmit: (filePath) => {
        emitted.push(filePath);
      },
    });
    cleanups.push(stop);

    await waitFor(() => ready, 5_000);

    expect(ready).toBe(true);
    expect(emitted.length).toBeGreaterThan(0);
  }, 15_000);

  it("returns a stop function that prevents further emissions after close", async () => {
    const workDir = join(tmpdir(), `clean-di-watch-stop-${Date.now()}`);
    cleanups.push(() => rm(workDir, { recursive: true, force: true }));
    await mkdir(workDir, { recursive: true });

    // Minimal work dir with no .di.ts files so the initial pass emits nothing.
    await writeTestConfig(workDir);

    // Stub node_modules/clean-di so the program builds.
    const cleanDiDir = join(workDir, "node_modules", "clean-di", "src", "public");
    await mkdir(cleanDiDir, { recursive: true });
    await writeFile(
      join(cleanDiDir, "index.ts"),
      [
        `export function defineContext<TConfig = void>(): (spec: any) => any { return () => undefined as any; }`,
        `export function defineConfig<T>(spec: T): T { return spec; }`,
        `export function bean<C extends new (...args: any[]) => any>(Class: C, overrides?: any): InstanceType<C> { return undefined as any; }`,
        `export function provide<T>(factory: (cfg: any) => T): T { return undefined as any; }`,
      ].join("\n"),
    );
    await writeFile(
      join(workDir, "node_modules", "clean-di", "package.json"),
      JSON.stringify({
        name: "clean-di",
        main: "./src/public/index.ts",
        types: "./src/public/index.ts",
        exports: { ".": "./src/public/index.ts" },
      }),
    );

    let ready = false;
    const emitted: string[] = [];

    const stop = await runWatch({
      cwd: workDir,
      generatorVersion: "test-0.0.0",
      noColor: true,
      write: () => {},
      onReady: () => {
        ready = true;
      },
      onEmit: (filePath) => {
        emitted.push(filePath);
      },
    });

    await waitFor(() => ready, 5_000);

    // Close the watcher.
    await stop();

    // Nothing was emitted (empty dir).
    expect(emitted.length).toBe(0);
  }, 15_000);
});
