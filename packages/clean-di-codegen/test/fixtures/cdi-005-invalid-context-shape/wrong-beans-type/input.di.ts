import { defineContext, bean } from "clean-di";

export class Logger {
  log(message: string): void {
    void message;
  }
}

// Malformed: `beans` is a variable reference, not an inline object literal.
// The codegen needs the literal in-place so it can analyze each entry.
const sharedBeans = {
  logger: bean(Logger),
};

export const loggerContext = defineContext()({
  beans: sharedBeans,
  expose: ["logger"] as const,
});
