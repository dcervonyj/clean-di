import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { defaultConfig } from "../../src/config/defaultConfig";
import { loadConfig } from "../../src/config/loadConfig";

describe("loadConfig()", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = join(tmpdir(), `clean-di-config-test-${Date.now()}-${Math.random()}`);
    await mkdir(workDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("returns defaultConfig when no config file exists", async () => {
    const result = await loadConfig(workDir);
    expect(result).toEqual(defaultConfig);
  });

  it("reads cleanDi key from package.json", async () => {
    await writeFile(
      join(workDir, "package.json"),
      JSON.stringify({
        name: "x",
        cleanDi: { tsconfig: "./custom-tsconfig.json" },
      }),
    );

    const result = await loadConfig(workDir);
    expect(result.tsconfig).toBe("./custom-tsconfig.json");
  });

  it("concatenates include arrays", async () => {
    await writeFile(
      join(workDir, "package.json"),
      JSON.stringify({
        name: "x",
        cleanDi: { include: ["custom/**/*.di.ts"] },
      }),
    );

    const result = await loadConfig(workDir);
    expect(result.include).toEqual([...defaultConfig.include, "custom/**/*.di.ts"]);
  });

  it("concatenates exclude arrays", async () => {
    await writeFile(
      join(workDir, "package.json"),
      JSON.stringify({
        name: "x",
        cleanDi: { exclude: ["custom-exclude/**"] },
      }),
    );

    const result = await loadConfig(workDir);
    expect(result.exclude).toEqual([...defaultConfig.exclude, "custom-exclude/**"]);
  });

  it("loads clean-di.config.js (ESM default export)", async () => {
    await writeFile(
      join(workDir, "clean-di.config.js"),
      `export default { tsconfig: "./js-tsconfig.json" };`,
    );

    const result = await loadConfig(workDir);
    expect(result.tsconfig).toBe("./js-tsconfig.json");
  });

  it("prefers .ts > .js > .mjs > package.json", async () => {
    // create all three; .ts should win
    await writeFile(join(workDir, "clean-di.config.ts"), `export default { tsconfig: "from-ts" };`);
    await writeFile(join(workDir, "clean-di.config.js"), `export default { tsconfig: "from-js" };`);
    await writeFile(
      join(workDir, "package.json"),
      JSON.stringify({ name: "x", cleanDi: { tsconfig: "from-pkg" } }),
    );

    const result = await loadConfig(workDir);
    expect(result.tsconfig).toBe("from-ts");
  });

  it("throws on unsupported output mode", async () => {
    await writeFile(
      join(workDir, "package.json"),
      JSON.stringify({
        name: "x",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cleanDi: { output: "single-file" as any },
      }),
    );

    await expect(loadConfig(workDir)).rejects.toThrow(/unsupported output mode/);
  });
});
