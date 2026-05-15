import { defineContext, bean } from "clean-di";

import { Logger } from "./Logger";
import { ServiceA } from "./ServiceA";
import { ServiceB } from "./ServiceB";

export const contextA = defineContext()({
  beans: {
    logger: bean(Logger),
    serviceA: bean(ServiceA),
  },
  expose: ["serviceA"] as const,
});

export const contextB = defineContext()({
  beans: {
    logger: bean(Logger),
    serviceB: bean(ServiceB),
  },
  expose: ["serviceB"] as const,
});
