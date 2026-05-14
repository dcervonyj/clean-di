import { defineContext, bean, type Container } from "clean-di";

import type { AppConfig } from "./AppConfig.js";
import { Logger } from "./Logger.js";
import { Greeter } from "./Greeter.js";

// The `name` config field is automatically available as a synthetic bean —
// no explicit `provide()` needed. Greeter's `name: string` param resolves
// against the synthetic `name` bean derived from AppConfig.
export const greeterContext: Container<AppConfig, { greeter: Greeter }> = defineContext<AppConfig>()({
  beans: {
    logger: bean(Logger),
    greeter: bean(Greeter),
  },
  expose: ["greeter"] as const,
});
