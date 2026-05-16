import { defineConfig, bean } from "clean-di";

import { BackupLogger } from "./BackupLogger";
import { Logger } from "./Logger";
import { Service } from "./Service";

export const bConfig = defineConfig({
  beans: {
    logger: bean(Logger),
    backupLogger: bean(BackupLogger),
    // DIFFERENT override for the same `service` bean — diamond conflict → CDI-013.
    service: bean(Service, { logger: "backupLogger" }),
  },
});
