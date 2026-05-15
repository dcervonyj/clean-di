import { defineConfig, bean } from "clean-di";

import { Logger } from "./Logger";

export const helperConfig = defineConfig({
  beans: {
    logger: bean(Logger),
  },
  postConstruct: ({ logger }: { logger: Logger }) => {
    logger.log("helper:postConstruct");
  },
  preDestroy: ({ logger }: { logger: Logger }) => {
    logger.log("helper:preDestroy");
  },
});
