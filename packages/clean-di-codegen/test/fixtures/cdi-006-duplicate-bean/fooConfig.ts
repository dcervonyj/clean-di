import { defineConfig, bean } from "clean-di";

import { Foo } from "./Foo";

export const fooConfig = defineConfig({
  beans: {
    foo: bean(Foo),
  },
});
