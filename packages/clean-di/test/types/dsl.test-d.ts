/**
 * Type-level tests for the clean-di public DSL surface (T-028).
 *
 * These tests use `expect-type` to verify the TypeScript surface behaves as
 * designed (DESIGN §2.1.7 "Type-safe public surface"). All assertions execute
 * at the type level only — `expectTypeOf` is a no-op at runtime. The file is
 * wrapped in vitest's `describe` / `it` so it runs as part of `pnpm test`
 * (per T-028 AC). If the file compiles, the assertions hold.
 */

import { expectTypeOf } from "expect-type";
import { describe, it } from "vitest";

import { bean, defineContext, provide } from "../../src";

class Logger {
  log(): void {}
}
class Counter {
  value = 0;
}
class PrivateThing {
  secret = "";
}

describe("DSL type surface (T-028)", () => {
  it("defineContext infers TBeans from the spec literal", () => {
    const _ctx = defineContext<{ name: string }>()({
      beans: {
        logger: provide(() => new Logger()),
        counter: bean(Counter),
      },
      expose: ["logger", "counter"] as const,
    });

    // The exposed shape is { logger: Logger, counter: Counter } — TBeans was
    // inferred from the spec literal (no manual generic argument needed).
    // Use ReturnType to keep this purely type-level — calling _ctx.get at
    // runtime would trip the pre-codegen fail-loud guard in defineContext.
    expectTypeOf<ReturnType<typeof _ctx.get>>().toEqualTypeOf<{
      logger: Logger;
      counter: Counter;
    }>();
  });

  it("Container.get requires { config } when TConfig is non-void", () => {
    const _ctx = defineContext<{ apiUrl: string }>()({
      beans: { logger: provide(() => new Logger()) },
      expose: ["logger"] as const,
    });

    // The overload picks the shape that includes `config`. `readonly` modifiers
    // match the actual definition in `Container.ts`.
    expectTypeOf(_ctx.get).parameter(0).toEqualTypeOf<{
      readonly config: { apiUrl: string };
      readonly key?: unknown;
    }>();
  });

  it("Container.get omits config when TConfig is void", () => {
    const ctx = defineContext()({
      beans: { logger: provide(() => new Logger()) },
      expose: ["logger"] as const,
    });

    // The overload picks the shape WITHOUT `config` — only the optional `key`.
    expectTypeOf(ctx.get).parameter(0).toEqualTypeOf<{
      readonly key?: unknown;
    }>();
  });

  it("ExposedOf narrows the bean bag to only the exposed keys", () => {
    const _ctx = defineContext()({
      beans: {
        logger: provide(() => new Logger()),
        counter: bean(Counter),
        privateThing: bean(PrivateThing), // NOT in expose
      },
      expose: ["logger"] as const, // only logger is exposed
    });

    // `privateThing` and `counter` are stripped by ExposedOf — the bag exposes
    // only `logger`. Type-only check (no runtime call on _ctx.get).
    type Exposed = ReturnType<typeof _ctx.get>;
    expectTypeOf<Exposed>().toEqualTypeOf<{ logger: Logger }>();

    // And the narrowed key set means `privateThing` is not accessible:
    type _NoPrivateThing =
      // @ts-expect-error — privateThing must not be on the exposed surface
      Exposed["privateThing"];
  });
});
