import { defineContext, bean } from "clean-di";

import { Logger } from "./Logger";
import { BackupLogger } from "./BackupLogger";
import { UseCase } from "./UseCase";

/**
 * Both `primaryLogger` and `secondaryLogger` are assignable to `Logger`.
 * `UseCase`'s constructor takes `audit: Logger`. The name fallback can't
 * rescue resolution because `audit` matches neither bean key by name, so the
 * resolver emits CDI-002 (AmbiguousDependency).
 */
export const ctx = defineContext()({
  beans: {
    primaryLogger: bean(Logger),
    secondaryLogger: bean(BackupLogger),
    useCase: bean(UseCase),
  },
  expose: ["useCase"] as const,
});
