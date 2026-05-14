import { defineContext, bean } from "clean-di";

import { Logger } from "./Logger";
import { commentsConfig } from "./commentsConfig";

export const blogContext = defineContext()({
  imports: [commentsConfig],
  beans: {
    logger: bean(Logger),
  },
  expose: ["listComments"] as const,
});
