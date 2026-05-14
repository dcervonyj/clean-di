import { defineContext, bean } from "clean-di";

export class Foo {
  private readonly tag = "foo";
  use(): void {
    void this.tag;
  }
}

// `MissingConfig` is intentionally not imported and not declared anywhere.
// The checker resolves the reference to the intrinsic `any` → CDI-009.
export const ctx = defineContext<MissingConfig>()({
  beans: {
    foo: bean(Foo),
  },
  expose: ["foo"] as const,
});
