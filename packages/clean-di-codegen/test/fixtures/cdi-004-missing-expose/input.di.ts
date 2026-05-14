import { defineContext, bean } from "clean-di";

class Logger {
  private readonly tag = "logger";
}

export const ctx = defineContext()({
  beans: {
    logger: bean(Logger),
  },
  expose: ["logger", "nonExistent"] as const,
});
