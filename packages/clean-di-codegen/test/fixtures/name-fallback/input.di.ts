import { defineContext, bean } from "clean-di";

import { Logger } from "./Logger";
import { BackupLogger } from "./BackupLogger";
import { UseCase } from "./UseCase";

/**
 * Two beans are assignable to `Logger`: the primary `logger` and the
 * structurally-compatible `backupLogger`. `UseCase`'s constructor takes
 * `logger: Logger`. Type-matching alone is ambiguous, but DESIGN §7.5 says
 * the resolver should fall back to parameter-name matching within the
 * candidates — picking `logger` because its key equals the parameter name
 * byte-for-byte.
 */
export const appContext = defineContext()({
  beans: {
    logger: bean(Logger),
    backupLogger: bean(BackupLogger),
    useCase: bean(UseCase),
  },
  expose: ["useCase"] as const,
});
