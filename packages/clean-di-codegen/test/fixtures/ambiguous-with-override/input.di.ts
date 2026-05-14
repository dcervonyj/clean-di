import { defineContext, bean, provide } from "clean-di";

import { MainLogger } from "./MainLogger";
import { BackupLogger } from "./BackupLogger";
import { UseCase } from "./UseCase";

export interface AppConfig {
  readonly mode: string;
}

export const appContext = defineContext<AppConfig>()({
  beans: {
    mode: provide<string>((cfg) => cfg.mode),
    mainLogger: bean(MainLogger),
    backupLogger: bean(BackupLogger),
    // Both `MainLogger` and `BackupLogger` share the same logging shape, so
    // structural matching alone would be ambiguous. `UseCase`'s constructor
    // declares `logger: MainLogger`, but the explicit override pins it to
    // `mainLogger` and demonstrates the W4 escape hatch.
    useCase: bean(UseCase, { logger: "mainLogger" }),
  },
  expose: ["useCase"] as const,
});
