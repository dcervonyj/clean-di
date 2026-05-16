import { defineContext } from "clean-di";

import { aConfig } from "./aConfig";
import { bConfig } from "./bConfig";

export const ctx = defineContext()({
  imports: [aConfig, bConfig],
  beans: {},
  expose: ["service"] as const,
});
