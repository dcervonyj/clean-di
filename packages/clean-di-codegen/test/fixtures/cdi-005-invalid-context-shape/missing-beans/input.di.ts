import { defineContext } from "clean-di";

// Malformed: the spec has no `beans` field.
export const emptyContext = defineContext()({
  expose: ["nothing"] as const,
});
