import { defineContext, bean } from "clean-di";

export class Logger {
  log(message: string): void {
    void message;
  }
}

// Malformed: missing the empty `()` between `defineContext` and the spec call.
// Correct form is `defineContext<TConfig>()(spec)`.
export const loggerContext = defineContext({
  beans: {
    logger: bean(Logger),
  },
  expose: ["logger"] as const,
});
