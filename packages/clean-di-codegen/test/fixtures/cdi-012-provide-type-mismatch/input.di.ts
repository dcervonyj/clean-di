import { defineContext, provide } from "clean-di";

export const ctx = defineContext()({
  beans: {
    // Declared as `provide<number>`, but the factory returns a string → CDI-012.
    badBean: provide<number>(() => "not a number"),
  },
  expose: ["badBean"] as const,
});
