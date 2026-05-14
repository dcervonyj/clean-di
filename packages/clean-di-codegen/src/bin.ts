#!/usr/bin/env node
import { createColors } from "picocolors";

import { parseArgs, HELP_TEXT } from "./cli/args.js";
import { runCheck } from "./cli/check.js";
import { runOnce } from "./cli/main.js";
import { runWatch } from "./cli/watch.js";
import { VERSION } from "./version.js";

const colors = createColors(process.stdout.isTTY === true);

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write(`${HELP_TEXT}\n`);
  process.exit(0);
}

if (args.version) {
  process.stdout.write(`clean-di-codegen ${VERSION}\n`);
  process.exit(0);
}

process.stdout.write(
  `${colors.cyan("clean-di-codegen")} ${colors.dim(VERSION)} — ${
    args.mode === "watch"
      ? colors.yellow("watch mode")
      : args.mode === "check"
        ? colors.blue("check mode")
        : "one-shot"
  }\n`,
);

const baseOptions = {
  ...(args.configPath !== undefined ? { configPath: args.configPath } : {}),
  generatorVersion: VERSION,
  noColor: args.noColor,
};

async function main(): Promise<void> {
  if (args.mode === "watch") {
    const stop = await runWatch({
      ...baseOptions,
      onReady: () => {
        process.stdout.write(`${colors.dim("Watching for changes…")}\n`);
      },
    });

    process.on("SIGINT", () => {
      void stop().then(() => {
        process.exit(0);
      });
    });
    process.on("SIGTERM", () => {
      void stop().then(() => {
        process.exit(0);
      });
    });
    return; // keep process alive
  }

  if (args.mode === "check") {
    const result = await runCheck(baseOptions);
    if (result.exitCode === 0) {
      process.stdout.write(`${colors.green("✓")} All generated files are up to date.\n`);
    }
    process.exit(result.exitCode);
    return;
  }

  // once
  const result = await runOnce(baseOptions);
  if (result.exitCode === 0) {
    process.stdout.write(
      `${colors.green("✓")} ${result.filesProcessed} file(s) processed, ${result.filesWritten} written.\n`,
    );
  }
  process.exit(result.exitCode);
}

main().catch((err: unknown) => {
  process.stderr.write(`clean-di-codegen: fatal error: ${String(err)}\n`);
  process.exit(1);
});
