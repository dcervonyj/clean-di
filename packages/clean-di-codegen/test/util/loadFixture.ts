import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ts from "typescript";

import type { Diagnostic } from "../../src/diagnostics/codes";

export interface FixtureLayout {
  /** Absolute path to the temp working directory (cleanup-on-teardown). */
  readonly workDir: string;
  /** Absolute path of the copied `input.di.ts` inside `workDir`. */
  readonly inputPath: string;
  /** The TS Program covering `workDir`. */
  readonly program: ts.Program;
  /** Parsed expected diagnostics, or `undefined` for positive fixtures. */
  readonly expectedDiagnostics: readonly ExpectedDiagnostic[] | undefined;
  /** Cleanup hook — call from `afterEach`. */
  readonly cleanup: () => Promise<void>;
}

export interface ExpectedDiagnostic {
  readonly code: string;
  readonly file?: string;
  readonly messageMatches?: string;
}

/**
 * Set up a temp work directory with a stubbed `clean-di` package and the
 * fixture files copied in. Returns a `FixtureLayout` ready for the codegen to
 * run against. Caller must call `cleanup()` to remove the temp dir.
 */
export async function loadFixture(fixtureDir: string): Promise<FixtureLayout> {
  const workDir = join(tmpdir(), `clean-di-fixture-${Date.now()}-${Math.random()}`);
  await mkdir(workDir, { recursive: true });
  await stubCleanDi(workDir);

  // Copy every source file from fixtureDir into workDir (preserving relative layout).
  await copyTreeShallow(fixtureDir, workDir);

  const inputPath = join(workDir, "input.di.ts");

  // Load expected-diagnostics.json if present (negative fixtures).
  let expectedDiagnostics: readonly ExpectedDiagnostic[] | undefined;
  try {
    const raw = await readFile(join(fixtureDir, "expected-diagnostics.json"), "utf8");
    const parsed = JSON.parse(raw);
    expectedDiagnostics = Array.isArray(parsed) ? parsed : parsed.diagnostics;
  } catch {
    expectedDiagnostics = undefined;
  }

  const program = ts.createProgram({
    rootNames: [inputPath],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: false,
      noEmit: true,
      allowJs: false,
      skipLibCheck: true,
      esModuleInterop: true,
      baseUrl: workDir,
    },
  });

  return {
    workDir,
    inputPath,
    program,
    expectedDiagnostics,
    cleanup: () => rm(workDir, { recursive: true, force: true }),
  };
}

/**
 * Compare a list of actual diagnostics against an `expected-diagnostics.json`
 * spec. Each expected entry must have at least one matching actual diagnostic
 * (matched on `code` and, when supplied, `messageMatches` as a regex). Extra
 * diagnostics in `actual` are tolerated.
 */
export function matchesExpected(
  actual: readonly Diagnostic[],
  expected: readonly ExpectedDiagnostic[],
): { ok: boolean; reason?: string } {
  for (const exp of expected) {
    const matched = actual.some(
      (a) =>
        a.code === exp.code &&
        (exp.messageMatches === undefined || new RegExp(exp.messageMatches).test(a.message)),
    );
    if (!matched) {
      return {
        ok: false,
        reason: `missing expected diagnostic ${exp.code}${
          exp.messageMatches !== undefined ? ` (matching /${exp.messageMatches}/)` : ""
        }. Actual: ${JSON.stringify(actual.map((a) => ({ code: a.code, message: a.message })))}`,
      };
    }
  }

  return { ok: true };
}

async function copyTreeShallow(src: string, dst: string): Promise<void> {
  const entries = await readdir(src);
  for (const entry of entries) {
    const fullSrc = join(src, entry);
    const fullDst = join(dst, entry);
    const st = await stat(fullSrc);
    if (st.isDirectory()) {
      await mkdir(fullDst, { recursive: true });
      await copyTreeShallow(fullSrc, fullDst);
    } else if (st.isFile() && entry !== "expected-diagnostics.json") {
      await copyFile(fullSrc, fullDst);
    }
  }
}

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
