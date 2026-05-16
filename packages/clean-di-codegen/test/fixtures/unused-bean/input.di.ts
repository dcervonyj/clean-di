import { defineContext, bean } from "clean-di";

import { Greeter } from "./Greeter";
import { Logger } from "./Logger";
import { Orphan } from "./Orphan";

export const ctx = defineContext()({
  beans: {
    logger: bean(Logger),
    greeter: bean(Greeter),
    // `orphan` is declared but no one depends on it and it isn't exposed → CDI-011 warning.
    orphan: bean(Orphan),
  },
  expose: ["greeter"] as const,
});
