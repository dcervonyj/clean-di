import { defineContext } from "clean-di";

import { SomeClass } from "./SomeClass";

// Each bean entry below has a RHS that is not a `bean(...)` or `provide(...)`
// call — each one must fire CDI-007 and be skipped.
export const ctx = defineContext()({
  beans: {
    // Plain object literal — not allowed.
    foo: { fake: true },
    // Class reference without `bean(...)` wrapper — not allowed.
    bar: SomeClass,
    // Arrow function not wrapped in `provide(...)` — not allowed.
    baz: () => 42,
  },
  expose: [] as const,
});
