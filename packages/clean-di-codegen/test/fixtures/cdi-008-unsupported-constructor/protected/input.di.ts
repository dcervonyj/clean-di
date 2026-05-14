import { defineContext, bean } from "clean-di";

export class ProtectedBase {
  private readonly tag = "protected-base";
  protected constructor() {
    void this.tag;
  }
}

export const ctx = defineContext()({
  beans: {
    protectedBase: bean(ProtectedBase),
  },
  expose: ["protectedBase"] as const,
});
