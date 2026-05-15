import { createContext as createDiContext } from "clean-di/runtime";

// ---------------------------------------------------------------------------
// Minimal domain classes for tests — each needs a nominal member so TypeScript
// doesn't structurally collapse them.
// ---------------------------------------------------------------------------

export class Logger {
  private readonly _tag = "logger";
  log(msg: string): string {
    return msg;
  }
}

export class Greeter {
  private readonly _tag = "greeter";
  constructor(private readonly logger: Logger) {}
  greet(name: string): string {
    return this.logger.log(`Hello, ${name}!`);
  }
}

export interface AppConfig {
  readonly greeting: string;
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

/** No-config container: exposes { greeter }. */
export const voidContainer = createDiContext<void, { greeter: Greeter }>(() => {
  const logger = new Logger();
  const greeter = new Greeter(logger);
  return { bag: { logger, greeter }, expose: { greeter } };
});

/** Config-bearing container: exposes { greeter }. */
export const configContainer = createDiContext<AppConfig, { greeter: Greeter }>((cfg) => {
  const logger = new Logger();
  const greeter = new Greeter(logger);
  // Use cfg so TypeScript doesn't complain about unused param.
  void cfg.greeting;
  return { bag: { logger, greeter }, expose: { greeter } };
});
