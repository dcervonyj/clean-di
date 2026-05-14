import { defineContext, bean } from "clean-di";

import { Foo } from "./Foo";

export const ctx = defineContext()({
  // A raw object literal is NOT a `defineConfig(...)` result → CDI-010.
  imports: [{ beans: {} }],
  beans: {
    foo: bean(Foo),
  },
  expose: ["foo"] as const,
});
