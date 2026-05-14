import { defineConfig, bean } from "clean-di";

import { ServiceA } from "./ServiceA";
import { sharedConfig } from "./sharedConfig";

export const aConfig = defineConfig({
  imports: [sharedConfig],
  beans: {
    serviceA: bean(ServiceA),
  },
});
