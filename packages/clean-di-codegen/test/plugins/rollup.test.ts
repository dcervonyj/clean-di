import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/index.js", () => ({
  runOnce: vi.fn(),
  runWatch: vi.fn(),
}));

import { runOnce } from "../../src/index.js";
import { cleanDiRollupPlugin } from "../../src/plugins/rollup";
import { VERSION } from "../../src/version";

const mockedRunOnce = vi.mocked(runOnce);

interface PluginHooksContext {
  readonly error: (msg: string) => never;
}

function invokeBuildStart(
  plugin: ReturnType<typeof cleanDiRollupPlugin>,
  ctx: PluginHooksContext,
): Promise<void> {
  const fn = plugin.buildStart as unknown as (this: PluginHooksContext) => Promise<void>;

  return fn.call(ctx);
}

describe("cleanDiRollupPlugin", () => {
  beforeEach(() => {
    mockedRunOnce.mockReset();
    mockedRunOnce.mockResolvedValue({ exitCode: 0, filesProcessed: 1, filesWritten: 1 });
  });

  it("registers under the name 'clean-di'", () => {
    const plugin = cleanDiRollupPlugin();
    expect(plugin.name).toBe("clean-di");
  });

  it("buildStart calls runOnce with provided options + generatorVersion", async () => {
    const plugin = cleanDiRollupPlugin({ cwd: "/tmp/proj", configPath: "clean-di.config.ts" });
    const errorSpy = vi.fn(() => {
      throw new Error("plugin.error called");
    });

    await invokeBuildStart(plugin, { error: errorSpy as never });

    expect(mockedRunOnce).toHaveBeenCalledTimes(1);
    expect(mockedRunOnce).toHaveBeenCalledWith({
      cwd: "/tmp/proj",
      configPath: "clean-di.config.ts",
      generatorVersion: VERSION,
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("buildStart works with default empty options", async () => {
    const plugin = cleanDiRollupPlugin();
    const errorSpy = vi.fn();

    await invokeBuildStart(plugin, { error: errorSpy as never });

    expect(mockedRunOnce).toHaveBeenCalledWith({ generatorVersion: VERSION });
  });

  it("buildStart calls this.error when runOnce returns non-zero exitCode", async () => {
    mockedRunOnce.mockResolvedValue({ exitCode: 1, filesProcessed: 1, filesWritten: 0 });

    const plugin = cleanDiRollupPlugin();
    const errorSpy = vi.fn(() => {
      throw new Error("plugin.error called");
    });

    await expect(invokeBuildStart(plugin, { error: errorSpy as never })).rejects.toThrow(
      "plugin.error called",
    );
    expect(errorSpy).toHaveBeenCalledWith("clean-di codegen failed");
  });
});
