import { defineConfig, bean } from "clean-di";

import { Logger } from "./Logger";

export const sharedConfig = defineConfig({
  beans: {
    logger: bean(Logger),
  },
});
