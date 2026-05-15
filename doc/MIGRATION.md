# Migrating to clean-di

This guide covers migrating from four popular TypeScript DI frameworks to `clean-di`.

**Core clean-di principle:** domain classes stay completely free of DI imports. All wiring lives in `.di.ts` files; `clean-di-codegen` generates the runtime wiring from constructor types.

---

## Table of Contents

1. [From InversifyJS](#1-from-inversifyjs)
2. [From tsyringe](#2-from-tsyringe)
3. [From Brandi](#3-from-brandi)
4. [From Awilix](#4-from-awilix)

---

## 1. From InversifyJS

InversifyJS uses `reflect-metadata`, `@injectable()` on every class, and `@inject(TOKEN)` for non-class dependencies. clean-di replaces all of that with a single `.di.ts` file and a codegen step.

### Before (InversifyJS)

```typescript
// tsconfig.json — required
// "experimentalDecorators": true
// "emitDecoratorMetadata": true

// main.ts
import "reflect-metadata";
import { Container, inject, injectable } from "inversify";

const TYPES = {
  Logger: Symbol("Logger"),
  Greeter: Symbol("Greeter"),
  AppName: Symbol("AppName"),
};

@injectable()
class Logger {
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }
}

@injectable()
class Greeter {
  constructor(
    @inject(TYPES.Logger) private readonly logger: Logger,
    @inject(TYPES.AppName) private readonly name: string,
  ) {}

  greet(): string {
    const message = `Hello, ${this.name}!`;
    this.logger.info(message);
    return message;
  }
}

const container = new Container();
container.bind<Logger>(TYPES.Logger).to(Logger);
container.bind<Greeter>(TYPES.Greeter).to(Greeter);
container.bind<string>(TYPES.AppName).toConstantValue("World");

const greeter = container.get<Greeter>(TYPES.Greeter);
greeter.greet();
```

### After (clean-di)

```typescript
// Logger.ts — no DI imports
export class Logger {
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }
}

// Greeter.ts — no DI imports
import { Logger } from "./Logger.js";

export class Greeter {
  constructor(
    private readonly logger: Logger,
    private readonly name: string,
  ) {}

  greet(): string {
    const message = `Hello, ${this.name}!`;
    this.logger.info(message);
    return message;
  }
}

// AppConfig.ts
export interface AppConfig {
  readonly name: string;
}

// GreeterContext.di.ts
import { defineContext, bean } from "clean-di";
import type { AppConfig } from "./AppConfig.js";
import { Logger } from "./Logger.js";
import { Greeter } from "./Greeter.js";

export const greeterContext = defineContext<AppConfig>()({
  beans: {
    logger: bean(Logger),
    greeter: bean(Greeter),
  },
  expose: ["greeter"] as const,
});

// Run: clean-di-codegen   →  generates GreeterContext.di.generated.ts

// index.ts
import { greeterContext } from "./GreeterContext.di.generated.js";

const container = greeterContext.get({ config: { name: "World" } });
container.greeter.greet();
```

### Migration Checklist

- [ ] Remove `import "reflect-metadata"` from all entry points and delete it from dependencies.
- [ ] Remove `"experimentalDecorators": true` and `"emitDecoratorMetadata": true` from `tsconfig.json`.
- [ ] Strip `@injectable()` and `@inject()` decorators from all domain classes.
- [ ] Delete the `TYPES` / `Symbol` token registry — clean-di resolves by structural type, not tokens.
- [ ] Replace `container.bind(...).to(...)` calls with a `defineContext` call in a `.di.ts` file.
- [ ] Move primitive / constant values (strings, numbers) into a typed config interface; they become synthetic beans automatically.
- [ ] Run `clean-di-codegen` to generate the wiring, then replace `container.get<T>(TOKEN)` call sites with `context.get({ config }).beanName`.

---

## 2. From tsyringe

tsyringe (by Microsoft) follows the same decorator pattern as InversifyJS: `@injectable()`, `@inject()`, and a required `reflect-metadata` polyfill. The migration path is nearly identical to InversifyJS.

### Before (tsyringe)

```typescript
// tsconfig.json — required
// "experimentalDecorators": true
// "emitDecoratorMetadata": true

// main.ts
import "reflect-metadata";
import { container, inject, injectable, InjectionToken } from "tsyringe";

const APP_NAME: InjectionToken<string> = "AppName";

@injectable()
class Logger {
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }
}

@injectable()
class Greeter {
  constructor(
    private readonly logger: Logger,
    @inject(APP_NAME) private readonly name: string,
  ) {}

  greet(): string {
    const message = `Hello, ${this.name}!`;
    this.logger.info(message);
    return message;
  }
}

container.register<string>(APP_NAME, { useValue: "World" });

const greeter = container.resolve(Greeter);
greeter.greet();
```

### After (clean-di)

```typescript
// Logger.ts — no DI imports
export class Logger {
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }
}

// Greeter.ts — no DI imports
import { Logger } from "./Logger.js";

export class Greeter {
  constructor(
    private readonly logger: Logger,
    private readonly name: string,
  ) {}

  greet(): string {
    const message = `Hello, ${this.name}!`;
    this.logger.info(message);
    return message;
  }
}

// AppConfig.ts
export interface AppConfig {
  readonly name: string;
}

// GreeterContext.di.ts
import { defineContext, bean } from "clean-di";
import type { AppConfig } from "./AppConfig.js";
import { Logger } from "./Logger.js";
import { Greeter } from "./Greeter.js";

export const greeterContext = defineContext<AppConfig>()({
  beans: {
    logger: bean(Logger),
    greeter: bean(Greeter),
  },
  expose: ["greeter"] as const,
});

// Run: clean-di-codegen   →  generates GreeterContext.di.generated.ts

// index.ts
import { greeterContext } from "./GreeterContext.di.generated.js";

const container = greeterContext.get({ config: { name: "World" } });
container.greeter.greet();
```

### Migration Checklist

- [ ] Remove `import "reflect-metadata"` from all entry points and delete the package.
- [ ] Remove `"experimentalDecorators": true` and `"emitDecoratorMetadata": true` from `tsconfig.json`.
- [ ] Strip `@injectable()` and `@inject()` decorators from every class.
- [ ] Replace string/symbol `InjectionToken` constants with typed fields on a config interface.
- [ ] Replace `container.register(...)` / `container.registerSingleton(...)` calls with `bean(...)` entries in a `.di.ts` file.
- [ ] Replace `container.resolve(SomeClass)` call sites with `context.get({ config }).beanName`.
- [ ] Run `clean-di-codegen` after each `.di.ts` change to keep the generated file up to date.

---

## 3. From Brandi

Brandi is token-based and decorator-free, which means domain classes are already clean. The main migration effort is eliminating the manual `injected(...)` wiring declarations — clean-di derives wiring automatically from constructor types.

### Before (Brandi)

```typescript
// tokens.ts
import { token } from "brandi";
import { Logger } from "./Logger.js";
import { Greeter } from "./Greeter.js";

export const TOKENS = {
  logger: token<Logger>("logger"),
  greeter: token<Greeter>("greeter"),
  appName: token<string>("appName"),
};

// Logger.ts — already clean
export class Logger {
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }
}

// Greeter.ts — injected() couples class to Brandi
import { injected } from "brandi";
import { Logger } from "./Logger.js";
import { TOKENS } from "./tokens.js";

export class Greeter {
  constructor(
    private readonly logger: Logger,
    private readonly name: string,
  ) {}

  greet(): string {
    const message = `Hello, ${this.name}!`;
    this.logger.info(message);
    return message;
  }
}
injected(Greeter, TOKENS.logger, TOKENS.appName);

// main.ts
import { Container } from "brandi";
import { TOKENS } from "./tokens.js";
import { Logger } from "./Logger.js";
import { Greeter } from "./Greeter.js";

const container = new Container();
container.bind(TOKENS.logger).toInstance(Logger).inSingletonScope();
container.bind(TOKENS.greeter).toInstance(Greeter).inSingletonScope();
container.bind(TOKENS.appName).toConstant("World");

const greeter = container.get(TOKENS.greeter);
greeter.greet();
```

### After (clean-di)

```typescript
// Logger.ts — unchanged, already clean
export class Logger {
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }
}

// Greeter.ts — remove injected() call, class is identical
import { Logger } from "./Logger.js";

export class Greeter {
  constructor(
    private readonly logger: Logger,
    private readonly name: string,
  ) {}

  greet(): string {
    const message = `Hello, ${this.name}!`;
    this.logger.info(message);
    return message;
  }
}

// AppConfig.ts
export interface AppConfig {
  readonly name: string;
}

// GreeterContext.di.ts
import { defineContext, bean } from "clean-di";
import type { AppConfig } from "./AppConfig.js";
import { Logger } from "./Logger.js";
import { Greeter } from "./Greeter.js";

export const greeterContext = defineContext<AppConfig>()({
  beans: {
    logger: bean(Logger),
    greeter: bean(Greeter),
  },
  expose: ["greeter"] as const,
});

// Run: clean-di-codegen   →  generates GreeterContext.di.generated.ts

// index.ts
import { greeterContext } from "./GreeterContext.di.generated.js";

const container = greeterContext.get({ config: { name: "World" } });
container.greeter.greet();
```

### Migration Checklist

- [ ] Delete the `tokens.ts` file (or equivalent) — clean-di resolves beans by structural type, not tokens.
- [ ] Remove all `injected(ClassName, ...tokens)` calls from domain and infrastructure classes.
- [ ] Remove `brandi` from your `dependencies`; domain classes require no changes beyond removing `injected()`.
- [ ] Collect constant values (strings, numbers, booleans) into a typed config interface; they become synthetic beans automatically.
- [ ] Replace `container.bind(TOKEN).toInstance(Class).inSingletonScope()` with `bean(Class)` entries in a `.di.ts` file.
- [ ] For shared beans reused across multiple contexts, extract them into a `defineConfig` sub-module and `import` it in each context.
- [ ] Run `clean-di-codegen` and replace `container.get(TOKEN)` with `context.get({ config }).beanName`.

---

## 4. From Awilix

Awilix uses name-based resolution: constructor parameter names must exactly match registered names. clean-di uses structural type matching (with parameter-name fallback for ambiguous types), so you can safely rename parameters without breaking wiring.

### Before (Awilix)

```typescript
// Logger.ts — already clean
export class Logger {
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }
}

// Greeter.ts — parameter names must match Awilix registration names
import { Logger } from "./Logger.js";

export class Greeter {
  // "logger" and "appName" must exactly match container.register() keys
  constructor(
    private readonly logger: Logger,
    private readonly appName: string,
  ) {}

  greet(): string {
    const message = `Hello, ${this.appName}!`;
    this.logger.info(message);
    return message;
  }
}

// main.ts
import { createContainer, asClass, asValue } from "awilix";
import { Logger } from "./Logger.js";
import { Greeter } from "./Greeter.js";

const container = createContainer();
container.register({
  logger: asClass(Logger).singleton(),
  greeter: asClass(Greeter).singleton(),
  appName: asValue("World"),
});

const greeter = container.resolve<Greeter>("greeter");
greeter.greet();
```

### After (clean-di)

```typescript
// Logger.ts — unchanged
export class Logger {
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }
}

// Greeter.ts — parameter name "name" no longer tied to a registry key
import { Logger } from "./Logger.js";

export class Greeter {
  constructor(
    private readonly logger: Logger,
    private readonly name: string,  // renamed freely; type drives resolution
  ) {}

  greet(): string {
    const message = `Hello, ${this.name}!`;
    this.logger.info(message);
    return message;
  }
}

// AppConfig.ts
export interface AppConfig {
  readonly name: string;
}

// GreeterContext.di.ts
import { defineContext, bean } from "clean-di";
import type { AppConfig } from "./AppConfig.js";
import { Logger } from "./Logger.js";
import { Greeter } from "./Greeter.js";

export const greeterContext = defineContext<AppConfig>()({
  beans: {
    logger: bean(Logger),
    greeter: bean(Greeter),
  },
  expose: ["greeter"] as const,
});

// Run: clean-di-codegen   →  generates GreeterContext.di.generated.ts

// index.ts
import { greeterContext } from "./GreeterContext.di.generated.js";

const container = greeterContext.get({ config: { name: "World" } });
container.greeter.greet();
```

### Migration Checklist

- [ ] Remove `awilix` from dependencies; delete `createContainer()` and `asClass()` / `asValue()` call sites.
- [ ] Replace constructor parameter names that were forced by Awilix name-matching with semantically correct names — clean-di resolves by type, not name.
- [ ] Move `asValue(...)` registrations to a typed config interface; config fields become synthetic beans automatically.
- [ ] Replace `container.register({ key: asClass(Cls).singleton() })` with `bean(Cls)` in a `.di.ts` file.
- [ ] For modular Awilix setups (multiple containers merged with `loadModules`), create one `defineConfig` sub-module per logical group and `import` them into a parent `defineContext`.
- [ ] Replace untyped `container.resolve<T>("name")` call sites with fully typed `context.get({ config }).beanName` — no string keys, no casts.
- [ ] Run `clean-di-codegen` after every `.di.ts` change to regenerate wiring.
