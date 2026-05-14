import { defineContext, bean } from "clean-di";

import { Logger } from "./Logger";
import { UseCase } from "./UseCase";

/**
 * `UseCase`'s constructor requires both `Logger` and `Database`, but only
 * `Logger` is declared in `beans` — `Database` has no matching bean in scope,
 * which forces a CDI-001 (UnresolvableDependency) diagnostic.
 */
export const ctx = defineContext()({
  beans: {
    logger: bean(Logger),
    useCase: bean(UseCase),
  },
  expose: ["useCase"] as const,
});
