import { defineConfig, bean } from "clean-di";

import { Adder } from "./Adder.js";
import { Multiplier } from "./Multiplier.js";

// Sub-config: defines math primitives shared by any context that imports this.
export const mathConfig = defineConfig({
  beans: {
    adder: bean(Adder),
    multiplier: bean(Multiplier),
  },
});
