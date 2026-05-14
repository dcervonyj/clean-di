import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ts from "typescript";

import { parseDiFile } from "../../src/analyzer/parseDiFile";

/**
 * Build a TS Program that includes a single fixture .di.ts file plus a
 * stub `clean-di` package (so symbol resolution succeeds without a real install).
 */
async function buildFixture(diSource: string): Promise<{ program: ts.Program; filePath: string; cleanup: () => Promise<void> }> {
  const root = join(tmpdir(), `clean-di-parse-test-${Date.now()}-${Math.random()}`);
  const cleanDiDir = join(root, "node_modules", "clean-di", "src", "public");
  await mkdir(cleanDiDir, { recursive: true });

  // Stub each public DSL entry the parser cares about.
  await writeFile(
    join(cleanDiDir, "defineContext.ts"),
    `export function defineContext<T = void>(): any { return () => null; }`,
  );
  await writeFile(
    join(cleanDiDir, "defineConfig.ts"),
    `export function defineConfig(spec: any): any { return spec; }`,
  );
  await writeFile(
    join(cleanDiDir, "bean.ts"),
    `export function bean(Class: any, overrides?: any): any { return { Class, overrides }; }`,
  );
  await writeFile(
    join(cleanDiDir, "provide.ts"),
    `export function provide<T>(factory: any): any { return { factory }; }`,
  );

  // Package.json + barrel index re-exports for resolution.
  await writeFile(
    join(root, "node_modules", "clean-di", "package.json"),
    JSON.stringify({ name: "clean-di", main: "./src/public/index.ts", types: "./src/public/index.ts" }),
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
  // Patch the package main to the barrel:
  await writeFile(
    join(root, "node_modules", "clean-di", "package.json"),
    JSON.stringify({
      name: "clean-di",
      main: "./src/public/index.ts",
      types: "./src/public/index.ts",
      exports: { ".": "./src/public/index.ts" },
    }),
  );

  const filePath = join(root, "input.di.ts");
  await writeFile(filePath, diSource);

  const program = ts.createProgram({
    rootNames: [filePath],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: false,
      noEmit: true,
      allowJs: false,
      skipLibCheck: true,
      esModuleInterop: true,
      baseUrl: root,
    },
  });

  return {
    program,
    filePath,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

describe("parseDiFile()", () => {
  let cleanupFn: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (cleanupFn !== null) {
      await cleanupFn();
      cleanupFn = null;
    }
  });

  it("locates a defineContext call", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { defineContext } from "clean-di";
       export const ctx = defineContext<void>()({ beans: {}, expose: [] as const });`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    expect(parsed.calls.some((c) => c.kind === "defineContext")).toBe(true);
  });

  it("locates bean and provide calls", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { bean, provide } from "clean-di";
       class Foo {}
       export const a = bean(Foo);
       export const b = provide(() => 42);`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    expect(parsed.calls.filter((c) => c.kind === "bean")).toHaveLength(1);
    expect(parsed.calls.filter((c) => c.kind === "provide")).toHaveLength(1);
  });

  it("resolves aliased imports (import bean as b)", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `import { bean as b } from "clean-di";
       class Foo {}
       export const x = b(Foo);`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    expect(parsed.calls.filter((c) => c.kind === "bean")).toHaveLength(1);
  });

  it("ignores unrelated function calls", async () => {
    const { program, filePath, cleanup } = await buildFixture(
      `export const x = JSON.stringify({});`,
    );
    cleanupFn = cleanup;

    const parsed = parseDiFile(program, filePath);
    expect(parsed.calls).toHaveLength(0);
  });

  it("throws if file is not in program", async () => {
    const { program, cleanup } = await buildFixture(`export const x = 1;`);
    cleanupFn = cleanup;
    expect(() => parseDiFile(program, "/tmp/nonexistent.ts")).toThrow(/not found/);
  });
});
