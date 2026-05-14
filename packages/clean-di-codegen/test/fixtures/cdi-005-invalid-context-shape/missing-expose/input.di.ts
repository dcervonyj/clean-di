import { defineContext, bean } from "clean-di";

export class Logger {
  log(message: string): void {
    void message;
  }
}

// Malformed: the spec has no `expose` field.
export const loggerContext = defineContext()({
  beans: {
    logger: bean(Logger),
  },
});
