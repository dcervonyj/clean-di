import { createContext as createDiContext } from "clean-di/runtime";
// NOTE: createContext is re-exported from the runtime entry for use by generated files

export class Logger {
  readonly messages: string[] = [];

  log(message: string): void {
    this.messages.push(message);
  }
}

export class Greeter {
  constructor(private readonly logger: Logger) {}

  greet(name: string): string {
    const message = `Hello, ${name}!`;
    this.logger.log(message);

    return message;
  }
}

export interface AppConfig {
  readonly greeting: string;
}

export const voidContainer = createDiContext<void, { greeter: Greeter }>(() => {
  const logger = new Logger();
  const greeter = new Greeter(logger);

  return {
    bag: { logger, greeter },
    expose: { greeter },
  };
});

export const configContainer = createDiContext<AppConfig, { greeter: Greeter }>((config) => {
  const logger = new Logger();
  const greeter = new Greeter(logger);
  logger.log(`Initialized with greeting: ${config.greeting}`);

  return {
    bag: { logger, greeter },
    expose: { greeter },
  };
});
