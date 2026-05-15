# Getting Started with clean-di

**Time: ~15 minutes** | **Prerequisites: Node 20+, TypeScript 5.0+**

`clean-di` is a TypeScript dependency injection framework that uses code generation instead of decorators or reflection. You write plain classes, define a context, run codegen once, and get a fully-typed container with zero runtime magic.

---

## Install

```bash
npm install clean-di clean-di-codegen
```

---

## Step 1 — Write your classes

No decorators, no annotations — just plain TypeScript classes. Dependencies are expressed through constructor parameters.

```ts
// src/Logger.ts
export class Logger {
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }
}
```

```ts
// src/Greeter.ts
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
```

---

## Step 2 — Define your config interface

Config values are supplied at runtime (e.g. from environment variables or a config file). Declare them as a plain interface.

```ts
// src/AppConfig.ts
export interface AppConfig {
  readonly name: string;
}
```

Each field in `AppConfig` automatically becomes a **synthetic bean** — `Greeter`'s `name: string` parameter resolves against `AppConfig.name` without any extra wiring.

---

## Step 3 — Write the context definition

Create a file ending in `.di.ts`. This is the **source of truth** that codegen reads.

```ts
// src/GreeterContext.di.ts
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
```

- `defineContext<AppConfig>()` pins the config type.
- `bean(ClassName)` declares a class-based bean; constructor params are resolved automatically.
- `expose` controls which beans are accessible on the returned container.

---

## Step 4 — Run codegen

```bash
npx clean-di-codegen
```

This scans for `*.di.ts` files and emits a sibling `*.di.generated.ts` next to each one. For the example above it produces:

```ts
// src/GreeterContext.di.generated.ts  (DO NOT EDIT)
import { createContext } from "clean-di/runtime";
import { type AppConfig } from "./AppConfig.js";
import { Logger } from "./Logger.js";
import { Greeter } from "./Greeter.js";

export const greeterContext = createContext<AppConfig, { greeter: Greeter }>(
  (cfg) => {
    const name = cfg.name;
    const logger = new Logger();
    const greeter = new Greeter(logger, name);

    return {
      bag: { name, logger, greeter },
      expose: { greeter },
    };
  },
);
```

Re-run codegen whenever you change a `.di.ts` file or modify a constructor signature.

---

## Step 5 — Use the context

Import from the **generated** file, not the `.di.ts` source.

```ts
// src/index.ts
import { greeterContext } from "./GreeterContext.di.generated.js";

const container = greeterContext.get({ config: { name: "World" } });
const greeting = container.greeter.greet();
console.log(greeting);
// → [INFO] Hello, World!
// → Hello, World!
```

`greeterContext.get({ config })` accepts your `AppConfig` and returns a fully-typed container — no casts, no `any`.

---

## Step 6 — Commit the generated file

Commit `*.di.generated.ts` alongside your source code.

**Why?**
- The generated file is the **stable, typed API** your application imports. Checking it in means consumers always have a working build without running codegen first.
- It makes diffs reviewable — you can see exactly what wiring changed when a constructor is updated.
- CI can verify the file is up to date without a full codegen run (see below).

---

## CI check mode

To catch stale generated files in CI without rewriting them:

```bash
npx clean-di-codegen --check
```

Exits with code `1` if any `.di.generated.ts` file is out of sync with its `.di.ts` source. Add this to your CI pipeline after `tsc` compilation.

---

## Next steps

| Example | What it shows |
|---------|---------------|
| [`examples/basic`](../examples/basic) | The full runnable version of this guide |
| [`examples/modular`](../examples/modular) | Splitting a large app into multiple contexts |
| [`examples/full-blog-app`](../examples/full-blog-app) | Real-world app with repositories, services, and HTTP handlers |
