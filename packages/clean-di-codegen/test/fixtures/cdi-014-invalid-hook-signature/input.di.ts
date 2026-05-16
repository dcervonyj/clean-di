import { defineContext, bean } from "clean-di";

import { Greeter } from "./Greeter";

export const ctx = defineContext()({
  beans: {
    greeter: bean(Greeter),
  },
  // Destructured first param references `missingBean` which is NOT declared → CDI-014.
  postConstruct: ({ missingBean }: { missingBean: { init: () => void } }) => {
    missingBean.init();
  },
  expose: ["greeter"] as const,
});
