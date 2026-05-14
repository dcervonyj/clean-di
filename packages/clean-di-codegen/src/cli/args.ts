import mri from "mri";

export type CliMode = "once" | "watch" | "check";

export interface CliArgs {
  readonly mode: CliMode;
  readonly configPath: string | undefined;
  readonly debugHash: boolean;
  readonly noColor: boolean;
  readonly help: boolean;
  readonly version: boolean;
}

export const HELP_TEXT = `\
clean-di-codegen — build-time TypeScript DI codegen

USAGE
  clean-di-codegen [options]

OPTIONS
  --watch, -w        Watch mode: re-run on file changes
  --check, -c        Check mode: verify generated files are up-to-date (exits 1 if stale)
  --config <path>    Explicit path to clean-di config file
  --debug-hash       Print hash inputs before writing each generated file
  --no-color         Disable ANSI color in output
  --version, -v      Print version and exit
  --help, -h         Print this help and exit`;

/**
 * Parse process.argv-style argument list (everything after the node binary
 * and script path, i.e. `process.argv.slice(2)`).
 */
export function parseArgs(argv: readonly string[]): CliArgs {
  const raw = mri(argv as string[], {
    boolean: ["watch", "check", "debug-hash", "color", "help", "version"],
    string: ["config"],
    alias: { w: "watch", c: "check", h: "help", v: "version" },
    default: {
      watch: false,
      check: false,
      "debug-hash": false,
      color: true, // --no-color sets this to false
      help: false,
      version: false,
    },
  });

  const mode: CliMode = raw["watch"] === true ? "watch" : raw["check"] === true ? "check" : "once";

  return {
    mode,
    configPath: typeof raw["config"] === "string" ? raw["config"] : undefined,
    debugHash: raw["debug-hash"] === true,
    noColor: raw["color"] === false,
    help: raw["help"] === true,
    version: raw["version"] === true,
  };
}
