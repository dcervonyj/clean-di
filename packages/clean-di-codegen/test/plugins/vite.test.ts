import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/index.js", () => ({
  runOnce: vi.fn(),
  runWatch: vi.fn(),
}));

import { runOnce, runWatch } from "../../src/index.js";
import { cleanDiVitePlugin } from "../../src/plugins/vite";
import { VERSION } from "../../src/version";

const mockedRunOnce = vi.mocked(runOnce);
const mockedRunWatch = vi.mocked(runWatch);

interface PluginHooksContext {
  readonly error: (msg: string) => never;
}

/** Cast helper that types each hook with its own `this` so we can invoke them. */
function hooks(plugin: ReturnType<typeof cleanDiVitePlugin>): {
  buildStart: (ctx: PluginHooksContext) => Promise<void>;
  configureServer: () => Promise<void>;
  closeBundle: () => Promise<void>;
} {
  return {
    buildStart: (ctx) => {
      const fn = plugin.buildStart as unknown as (this: PluginHooksContext) => Promise<void>;

      return fn.call(ctx);
    },
    configureServer: () => {
      const fn = plugin.configureServer as unknown as () => Promise<void>;

      return fn();
    },
    closeBundle: () => {
      const fn = plugin.closeBundle as unknown as () => Promise<void>;

      return fn();
    },
  };
}

describe("cleanDiVitePlugin", () => {
  beforeEach(() => {
    mockedRunOnce.mockReset();
    mockedRunWatch.mockReset();
    mockedRunOnce.mockResolvedValue({ exitCode: 0, filesProcessed: 1, filesWritten: 1 });
    mockedRunWatch.mockResolvedValue(async () => {});
  });

  it("registers under the name 'clean-di'", () => {
    const plugin = cleanDiVitePlugin();
    expect(plugin.name).toBe("clean-di");
  });

  it("buildStart calls runOnce with provided options + generatorVersion", async () => {
    const plugin = cleanDiVitePlugin({ cwd: "/tmp/proj", configPath: "clean-di.config.ts" });
    const errorSpy = vi.fn(() => {
      throw new Error("plugin.error called");
    });

    await hooks(plugin).buildStart({ error: errorSpy as never });

    expect(mockedRunOnce).toHaveBeenCalledTimes(1);
    expect(mockedRunOnce).toHaveBeenCalledWith({
      cwd: "/tmp/proj",
      configPath: "clean-di.config.ts",
      generatorVersion: VERSION,
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("buildStart works with default empty options", async () => {
    const plugin = cleanDiVitePlugin();
    const errorSpy = vi.fn(() => {
      throw new Error("plugin.error called");
    });

    await hooks(plugin).buildStart({ error: errorSpy as never });

    expect(mockedRunOnce).toHaveBeenCalledWith({ generatorVersion: VERSION });
  });

  it("buildStart calls this.error when runOnce returns non-zero exitCode", async () => {
    mockedRunOnce.mockResolvedValue({ exitCode: 1, filesProcessed: 1, filesWritten: 0 });

    const plugin = cleanDiVitePlugin();
    const errorSpy = vi.fn(() => {
      throw new Error("plugin.error called");
    });

    await expect(hooks(plugin).buildStart({ error: errorSpy as never })).rejects.toThrow(
      "plugin.error called",
    );
    expect(errorSpy).toHaveBeenCalledWith("clean-di codegen failed");
  });

  it("configureServer starts a watcher via runWatch", async () => {
    const stop = vi.fn(async () => {});
    mockedRunWatch.mockResolvedValue(stop);

    const plugin = cleanDiVitePlugin({ cwd: "/tmp/proj" });
    await hooks(plugin).configureServer();

    expect(mockedRunWatch).toHaveBeenCalledTimes(1);
    expect(mockedRunWatch).toHaveBeenCalledWith({
      cwd: "/tmp/proj",
      generatorVersion: VERSION,
    });
  });

  it("closeBundle stops the watcher started by configureServer", async () => {
    const stop = vi.fn(async () => {});
    mockedRunWatch.mockResolvedValue(stop);

    const plugin = cleanDiVitePlugin();
    await hooks(plugin).configureServer();
    await hooks(plugin).closeBundle();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("closeBundle is a no-op when no watcher was started", async () => {
    const plugin = cleanDiVitePlugin();
    await expect(hooks(plugin).closeBundle()).resolves.toBeUndefined();
    expect(mockedRunWatch).not.toHaveBeenCalled();
  });

  it("buildStart skips runOnce in dev mode (configureServer already ran watcher)", async () => {
    const stop = vi.fn(async () => {});
    mockedRunWatch.mockResolvedValue(stop);

    const plugin = cleanDiVitePlugin();
    const errorSpy = vi.fn(() => {
      throw new Error("plugin.error called");
    });

    await hooks(plugin).configureServer();
    await hooks(plugin).buildStart({ error: errorSpy as never });

    expect(mockedRunOnce).not.toHaveBeenCalled();
  });

  it("closeBundle allows a fresh watcher to start on the next dev cycle", async () => {
    const stop1 = vi.fn(async () => {});
    const stop2 = vi.fn(async () => {});
    mockedRunWatch.mockResolvedValueOnce(stop1).mockResolvedValueOnce(stop2);

    const plugin = cleanDiVitePlugin();
    await hooks(plugin).configureServer();
    await hooks(plugin).closeBundle();

    // After closeBundle the second buildStart should call runOnce (not be
    // skipped) because watchStop was cleared.
    const errorSpy = vi.fn();
    await hooks(plugin).buildStart({ error: errorSpy as never });
    expect(mockedRunOnce).toHaveBeenCalledTimes(1);
  });
});
