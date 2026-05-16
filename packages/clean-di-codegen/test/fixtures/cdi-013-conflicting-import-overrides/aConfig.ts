import { defineConfig, bean } from "clean-di";

import { BackupLogger } from "./BackupLogger";
import { Logger } from "./Logger";
import { Service } from "./Service";

export const aConfig = defineConfig({
  beans: {
    logger: bean(Logger),
    backupLogger: bean(BackupLogger),
    // Override: route `logger` constructor param to bean named `logger`.
    service: bean(Service, { logger: "logger" }),
  },
});
