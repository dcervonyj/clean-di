/**
 * roundtrip.test.ts — T-086
 *
 * Integration test: run codegen programmatically, then compile the emitted
 * `.di.generated.ts` with tsc --noEmit and assert exit 0.
 *
 * This proves the generated TypeScript is valid under the project's strict
 * compiler settings (exactOptionalPropertyTypes, strict, NodeNext, etc.).
 */
import { execFile as execFileCb } from "node:child_process";
import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runOnce } from "../../src/cli/main";

const execFile = promisify(execFileCb);

/** Path to the tsc binary shipped with the dev-dependency in this package. */
const TSC = resolve(__dirname, "../../node_modules/.bin/tsc");

/** Workspace path of the built clean-di dist (for resolving `clean-di/runtime`). */
const CLEAN_DI_DIST = resolve(__dirname, "../../node_modules/clean-di/dist");

const FIXTURES_ROOT = resolve(__dirname, "../fixtures");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run tsc --noEmit against a generated tsconfig.tsc.json in `dir`.
 * Returns the exit code and combined output.
 */
async function runTsc(dir: string): Promise<{ exitCode: number; output: string }> {
  try {
    const { stdout, stderr } = await execFile(TSC, ["--project", join(dir, "tsconfig.tsc.json")], {
      cwd: dir,
    });
    return { exitCode: 0, output: stdout + stderr };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      exitCode: typeof e.code === "number" ? e.code : 1,
      output: (e.stdout ?? "") + (e.stderr ?? ""),
    };
  }
}

/**
 * Shallow-copy every non-JSON, non-snapshot file from `src` to `dst`.
 * Mirrors the copy logic in test/util/loadFixture.ts.
 */
async function copyFixtureFiles(src: string, dst: string): Promise<void> {
  const entries = await readdir(src);
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const dstPath = join(dst, entry);
    const st = await stat(srcPath);
    if (st.isDirectory()) {
      await mkdir(dstPath, { recursive: true });
      await copyFixtureFiles(srcPath, dstPath);
    } else if (
      st.isFile() &&
      entry !== "expected-diagnostics.json" &&
      entry !== "expected.di.generated.ts"
    ) {
      await copyFile(srcPath, dstPath);
    }
  }
}

/**
 * Stub the clean-di package for codegen (separate per-function files so
 * parseDiFile's regex symbol identity matching resolves correctly) AND install
 * the real runtime dist so tsc can type-check `import { createContext } from
 * "clean-di/runtime"`.
 */
async function setupCleanDi(workDir: string): Promise<void> {
  const cleanDiRoot = join(workDir, "node_modules", "clean-di");
  const stubDir = join(cleanDiRoot, "src", "public");
  const distDir = join(cleanDiRoot, "dist");

  await mkdir(stubDir, { recursive: true });
  await mkdir(distDir, { recursive: true });

  // Codegen stubs (symbol identity must live in separate files).
  await writeFile(
    join(stubDir, "defineContext.ts"),
    `export function defineContext<TConfig = void>(): (spec: any) => any { return () => undefined as any; }`,
  );
  await writeFile(
    join(stubDir, "defineConfig.ts"),
    `export function defineConfig<T>(spec: T): T { return spec; }`,
  );
  await writeFile(
    join(stubDir, "bean.ts"),
    `export function bean<C extends new (...args: any[]) => any>(Class: C, overrides?: any): InstanceType<C> { return undefined as any; }`,
  );
  await writeFile(
    join(stubDir, "provide.ts"),
    `export function provide<T>(factory: (cfg: any) => T): T { return undefined as any; }`,
  );
  await writeFile(
    join(stubDir, "index.ts"),
    [
      `export { defineContext } from "./defineContext";`,
      `export { defineConfig } from "./defineConfig";`,
      `export { bean } from "./bean";`,
      `export { provide } from "./provide";`,
    ].join("\n"),
  );

  // Copy the real runtime dist so tsc resolves `clean-di/runtime`.
  const runtimeSrcDir = join(CLEAN_DI_DIST, "runtime");
  const runtimeDstDir = join(distDir, "runtime");
  await mkdir(runtimeDstDir, { recursive: true });
  await copyFixtureFiles(runtimeSrcDir, runtimeDstDir);
  await copyFile(join(CLEAN_DI_DIST, "runtime.d.ts"), join(distDir, "runtime.d.ts"));
  await copyFile(join(CLEAN_DI_DIST, "runtime.d.ts.map"), join(distDir, "runtime.d.ts.map"));

  await writeFile(
    join(cleanDiRoot, "package.json"),
    JSON.stringify({
      name: "clean-di",
      main: "./src/public/index.ts",
      types: "./src/public/index.ts",
      exports: {
        ".": "./src/public/index.ts",
        "./runtime": {
          types: "./dist/runtime.d.ts",
          import: "./dist/runtime.js",
        },
      },
    }),
  );
}

/** Write package.json (cleanDi config) and tsconfig.json (for codegen). */
async function writeCodegenConfig(dir: string): Promise<void> {
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

/**
 * Write a separate tsconfig used only by the tsc --noEmit round-trip check.
 * Includes the generated file and the original .di.ts (for config type exports),
 * using the same strict settings as the project.
 */
async function writeTscConfig(dir: string, filesToCheck: string[]): Promise<void> {
  await writeFile(
    join(dir, "tsconfig.tsc.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: false,
        skipLibCheck: true,
        noEmit: true,
        baseUrl: ".",
      },
      include: filesToCheck,
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("roundtrip — codegen output compiles with tsc --noEmit", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = join(tmpdir(), `clean-di-roundtrip-${Date.now()}-${Math.random()}`);
    await mkdir(workDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("imports fixture — generated file with cross-module beans compiles without errors", async () => {
    // The imports fixture exercises import-resolution and multi-file bean graphs.
    // The config type is void so no missing-import issue arises.
    const fixtureDir = join(FIXTURES_ROOT, "imports");
    await setupCleanDi(workDir);
    await writeCodegenConfig(workDir);
    await copyFixtureFiles(fixtureDir, workDir);

    const result = await runOnce({
      cwd: workDir,
      generatorVersion: "test-0.0.0",
      noColor: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.filesWritten).toBeGreaterThan(0);

    // Include all .ts files so cross-file references resolve.
    await writeTscConfig(workDir, ["input.di.generated.ts", "input.di.ts", "*.ts"]);

    const tscResult = await runTsc(workDir);

    expect(tscResult.exitCode).toBe(0);
  }, 30_000);

  it("lifecycle fixture — generated file with hooks compiles without errors", async () => {
    const fixtureDir = join(FIXTURES_ROOT, "lifecycle");
    await setupCleanDi(workDir);
    await writeCodegenConfig(workDir);
    await copyFixtureFiles(fixtureDir, workDir);

    const result = await runOnce({
      cwd: workDir,
      generatorVersion: "test-0.0.0",
      noColor: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.filesWritten).toBeGreaterThan(0);

    await writeTscConfig(workDir, ["input.di.generated.ts", "input.di.ts", "*.ts"]);

    const tscResult = await runTsc(workDir);

    expect(tscResult.exitCode).toBe(0);
  }, 30_000);

  it("name-fallback fixture — generated file compiles without errors", async () => {
    const fixtureDir = join(FIXTURES_ROOT, "name-fallback");
    await setupCleanDi(workDir);
    await writeCodegenConfig(workDir);
    await copyFixtureFiles(fixtureDir, workDir);

    const result = await runOnce({
      cwd: workDir,
      generatorVersion: "test-0.0.0",
      noColor: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.filesWritten).toBeGreaterThan(0);

    await writeTscConfig(workDir, ["input.di.generated.ts", "input.di.ts", "*.ts"]);

    const tscResult = await runTsc(workDir);

    expect(tscResult.exitCode).toBe(0);
  }, 30_000);
});
