import { defineContext, bean, type Container } from "clean-di";

import type { MathConfig } from "./MathConfig.js";
import { mathConfig } from "./mathConfig.di.js";
import { Calculator } from "./Calculator.js";

// Top-level context that pulls in mathConfig as a sub-module.
// `adder` and `multiplier` beans come from mathConfig automatically.
export const calcContext: Container<MathConfig, { calculator: Calculator }> =
  defineContext<MathConfig>()({
    imports: [mathConfig],
    beans: {
      calculator: bean(Calculator),
    },
    expose: ["calculator"] as const,
  });
