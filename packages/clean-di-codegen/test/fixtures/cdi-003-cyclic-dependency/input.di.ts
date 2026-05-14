import { defineContext, bean } from "clean-di";

import { ServiceA } from "./ServiceA";
import { ServiceB } from "./ServiceB";

/**
 * `ServiceA` depends on `ServiceB`, and `ServiceB` depends on `ServiceA` — a
 * direct two-node cycle. The topological sort cannot order them, so the
 * resolver must emit CDI-003 (CyclicDependency).
 */
export const ctx = defineContext()({
  beans: {
    serviceA: bean(ServiceA),
    serviceB: bean(ServiceB),
  },
  expose: ["serviceA", "serviceB"] as const,
});
