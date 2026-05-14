import { defineContext, bean } from "clean-di";

import { OtherFoo } from "./OtherFoo";
import { fooConfig } from "./fooConfig";

export const ctx = defineContext()({
  imports: [fooConfig],
  beans: {
    // Collides with `foo` from fooConfig — must emit CDI-006.
    foo: bean(OtherFoo),
  },
  expose: ["foo"] as const,
});
