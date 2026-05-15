import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const _dir = dirname(fileURLToPath(import.meta.url));

/** Package version read from package.json at module load time. */
export const VERSION: string = (
  JSON.parse(readFileSync(join(_dir, "../package.json"), "utf8")) as { version: string }
).version;
