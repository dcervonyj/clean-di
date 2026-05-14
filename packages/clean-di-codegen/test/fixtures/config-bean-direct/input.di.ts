import { defineContext, bean } from "clean-di";

import { Logger } from "./Logger";
import { Greeter } from "./Greeter";

export interface GreeterConfig {
  readonly prefix: string;
}

// No explicit `provide()` for `prefix` — resolution falls back to the synthetic
// config bean (T-046). The emitter should emit `const prefix = cfg.prefix`.
export const greeterContext = defineContext<GreeterConfig>()({
  beans: {
    logger: bean(Logger),
    greeter: bean(Greeter),
  },
  expose: ["greeter"] as const,
});
