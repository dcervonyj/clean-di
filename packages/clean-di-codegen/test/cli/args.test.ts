import { describe, it, expect } from "vitest";

import { parseArgs, HELP_TEXT } from "../../src/cli/args";

describe("parseArgs", () => {
  it("defaults to once mode", () => {
    const args = parseArgs([]);
    expect(args.mode).toBe("once");
    expect(args.configPath).toBeUndefined();
    expect(args.debugHash).toBe(false);
    expect(args.noColor).toBe(false);
    expect(args.help).toBe(false);
    expect(args.version).toBe(false);
  });

  it("--watch sets mode to watch", () => {
    expect(parseArgs(["--watch"]).mode).toBe("watch");
  });

  it("-w sets mode to watch", () => {
    expect(parseArgs(["-w"]).mode).toBe("watch");
  });

  it("--check sets mode to check", () => {
    expect(parseArgs(["--check"]).mode).toBe("check");
  });

  it("-c sets mode to check", () => {
    expect(parseArgs(["-c"]).mode).toBe("check");
  });

  it("--watch takes precedence over --check", () => {
    expect(parseArgs(["--watch", "--check"]).mode).toBe("watch");
  });

  it("--config sets configPath", () => {
    expect(parseArgs(["--config", "my.config.ts"]).configPath).toBe("my.config.ts");
  });

  it("--debug-hash sets debugHash", () => {
    expect(parseArgs(["--debug-hash"]).debugHash).toBe(true);
  });

  it("--no-color sets noColor", () => {
    expect(parseArgs(["--no-color"]).noColor).toBe(true);
  });

  it("--help sets help flag", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
  });

  it("-h sets help flag", () => {
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  it("--version sets version flag", () => {
    expect(parseArgs(["--version"]).version).toBe(true);
  });

  it("-v sets version flag", () => {
    expect(parseArgs(["-v"]).version).toBe(true);
  });

  it("does not set configPath when --config is absent", () => {
    expect(parseArgs(["--watch"]).configPath).toBeUndefined();
  });
});

describe("HELP_TEXT", () => {
  it("contains key flags", () => {
    expect(HELP_TEXT).toContain("--watch");
    expect(HELP_TEXT).toContain("--check");
    expect(HELP_TEXT).toContain("--config");
    expect(HELP_TEXT).toContain("--no-color");
  });
});
