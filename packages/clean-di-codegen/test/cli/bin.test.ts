/**
 * bin.test.ts — T-085
 *
 * Invokes dist/bin.js as a subprocess via execFile to test the CLI entry point
 * in isolation. Covers --help, --version, one-shot, --check, and error cases.
 */
import { execFile as execFileCb } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFile = promisify(execFileCb);

const BIN_PATH = resolve(__dirname, "../../dist/bin.js");
const NODE = process.execPath;

/** Run dist/bin.js with the given arguments inside `cwd`. */
async function runBin(
  args: readonly string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFile(NODE, [BIN_PATH, ...args], { cwd });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: typeof e.code === "number" ? e.code : 1,
    };
  }
}

/** Minimal package.json + tsconfig that makes the codegen find .di.ts files. */
async function writeWorkspaceConfig(dir: string, include: string[]): Promise<void> {
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "test-workspace",
      cleanDi: { include, exclude: ["**/node_modules/**"] },
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
 * Stub the clean-di package with separate per-function files so parseDiFile's
 * regex-based symbol identity matching (`clean-di/(src|dist)/public/bean.ts`)
 * resolves correctly.
 */
async function stubCleanDi(workDir: string): Promise<void> {
  const cleanDiDir = join(workDir, "node_modules", "clean-di", "src", "public");
  await mkdir(cleanDiDir, { recursive: true });

  await writeFile(
    join(cleanDiDir, "defineContext.ts"),
    `export function defineContext<TConfig = void>(): (spec: any) => any { return () => undefined as any; }`,
  );
  await writeFile(
    join(cleanDiDir, "defineConfig.ts"),
    `export function defineConfig<T>(spec: T): T { return spec; }`,
  );
  await writeFile(
    join(cleanDiDir, "bean.ts"),
    `export function bean<C extends new (...args: any[]) => any>(Class: C, overrides?: any): InstanceType<C> { return undefined as any; }`,
  );
  await writeFile(
    join(cleanDiDir, "provide.ts"),
    `export function provide<T>(factory: (cfg: any) => T): T { return undefined as any; }`,
  );
  await writeFile(
    join(cleanDiDir, "index.ts"),
    [
      `export { defineContext } from "./defineContext";`,
      `export { defineConfig } from "./defineConfig";`,
      `export { bean } from "./bean";`,
      `export { provide } from "./provide";`,
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
}

/** Minimal valid .di.ts source for subprocess smoke tests. */
const SIMPLE_DI_SOURCE = `\
import { defineContext, bean } from "clean-di";

export class Logger {
  private readonly tag = "logger";
  log(): void {}
}

export const ctx = defineContext()({
  beans: { logger: bean(Logger) },
  expose: ["logger"] as const,
});
`;

describe("dist/bin.js — help and version", () => {
  it("--help exits 0 and prints usage to stdout", async () => {
    const { stdout, exitCode } = await runBin(["--help", "--no-color"], tmpdir());

    expect(exitCode).toBe(0);
    expect(stdout).toContain("clean-di-codegen");
    expect(stdout).toContain("--watch");
    expect(stdout).toContain("--check");
    expect(stdout).toContain("--help");
  }, 30_000);

  it("-h alias exits 0 and prints usage", async () => {
    const { stdout, exitCode } = await runBin(["-h", "--no-color"], tmpdir());

    expect(exitCode).toBe(0);
    expect(stdout).toContain("--watch");
  }, 30_000);

  it("--version exits 0 and prints the version string", async () => {
    const { stdout, exitCode } = await runBin(["--version", "--no-color"], tmpdir());

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/clean-di-codegen \d+\.\d+\.\d+/);
  }, 30_000);

  it("-v alias exits 0 and prints the version string", async () => {
    const { stdout, exitCode } = await runBin(["-v", "--no-color"], tmpdir());

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/clean-di-codegen \d+\.\d+\.\d+/);
  }, 30_000);
});

describe("dist/bin.js — one-shot mode", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = join(tmpdir(), `clean-di-bin-test-${Date.now()}-${Math.random()}`);
    await mkdir(workDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("exits 0 and reports 0 files processed when no .di.ts files exist", async () => {
    await writeWorkspaceConfig(workDir, ["**/*.di.ts"]);

    const { stdout, exitCode } = await runBin(["--no-color"], workDir);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("0 file(s) processed");
  }, 30_000);

  it("exits 0 and writes a .di.generated.ts when a valid .di.ts is present", async () => {
    await stubCleanDi(workDir);
    await writeWorkspaceConfig(workDir, ["**/*.di.ts"]);
    await writeFile(join(workDir, "app.di.ts"), SIMPLE_DI_SOURCE);

    const { exitCode } = await runBin(["--no-color"], workDir);

    expect(exitCode).toBe(0);
    expect(existsSync(join(workDir, "app.di.generated.ts"))).toBe(true);
  }, 30_000);

  it("exits 1 when the .di.ts file contains a CDI error", async () => {
    await stubCleanDi(workDir);
    await writeWorkspaceConfig(workDir, ["**/*.di.ts"]);

    // Invalid: expose references a bean name that does not exist in scope.
    const badSource = `\
import { defineContext, bean } from "clean-di";

export class Logger {
  private readonly tag = "logger";
}

export const ctx = defineContext()({
  beans: { logger: bean(Logger) },
  expose: ["nonExistent"] as const,
});
`;
    await writeFile(join(workDir, "bad.di.ts"), badSource);

    const { exitCode } = await runBin(["--no-color"], workDir);

    expect(exitCode).toBe(1);
  }, 30_000);
});

describe("dist/bin.js — check mode", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = join(tmpdir(), `clean-di-bin-check-${Date.now()}-${Math.random()}`);
    await mkdir(workDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("exits 0 when no .di.ts files exist (nothing to check)", async () => {
    await writeWorkspaceConfig(workDir, ["**/*.di.ts"]);

    const { exitCode, stdout } = await runBin(["--check", "--no-color"], workDir);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("up to date");
  }, 30_000);

  it("exits 1 when generated file is missing", async () => {
    await stubCleanDi(workDir);
    await writeWorkspaceConfig(workDir, ["**/*.di.ts"]);
    await writeFile(join(workDir, "app.di.ts"), SIMPLE_DI_SOURCE);

    const { exitCode } = await runBin(["--check", "--no-color"], workDir);

    expect(exitCode).toBe(1);
  }, 30_000);

  it("exits 0 after one-shot generates the file", async () => {
    await stubCleanDi(workDir);
    await writeWorkspaceConfig(workDir, ["**/*.di.ts"]);
    await writeFile(join(workDir, "app.di.ts"), SIMPLE_DI_SOURCE);

    // First run: generate the file.
    const onceResult = await runBin(["--no-color"], workDir);
    expect(onceResult.exitCode).toBe(0);

    // Second run: check must pass because file is now up to date.
    const checkResult = await runBin(["--check", "--no-color"], workDir);

    expect(checkResult.exitCode).toBe(0);
  }, 30_000);

  it("exits 1 when generated file is stale", async () => {
    await stubCleanDi(workDir);
    await writeWorkspaceConfig(workDir, ["**/*.di.ts"]);
    await writeFile(join(workDir, "app.di.ts"), SIMPLE_DI_SOURCE);

    // Generate the file first, then overwrite it with stale content.
    await runBin(["--no-color"], workDir);
    await writeFile(join(workDir, "app.di.generated.ts"), "// stale content\n");

    const { exitCode } = await runBin(["--check", "--no-color"], workDir);

    expect(exitCode).toBe(1);
  }, 30_000);
});
