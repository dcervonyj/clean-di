import { defineConfig, bean } from "clean-di";

import { ServiceB } from "./ServiceB";
import { sharedConfig } from "./sharedConfig";

export const bConfig = defineConfig({
  imports: [sharedConfig],
  beans: {
    serviceB: bean(ServiceB),
  },
});
