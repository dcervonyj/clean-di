import { describe, expect, it } from "vitest";

import { bean } from "../../src/public/bean";
import { defineConfig } from "../../src/public/defineConfig";

class Logger {}
class Repository {
  constructor(public readonly logger: Logger) {}
}

describe("defineConfig()", () => {
  it("returns a marker that stores the spec verbatim", () => {
    const spec = {
      beans: {
        logger: bean(Logger),
        repo: bean(Repository),
      },
    };

    const config = defineConfig(spec);

    expect(config.spec).toBe(spec);
    expect(config.spec.beans).toBe(spec.beans);
  });

  it("supports optional postConstruct and preDestroy", () => {
    const postConstruct = (): void => {
      /* noop */
    };
    const preDestroy = (): void => {
      /* noop */
    };
    const config = defineConfig({
      beans: { logger: bean(Logger) },
      postConstruct,
      preDestroy,
    });

    expect(config.spec.postConstruct).toBe(postConstruct);
    expect(config.spec.preDestroy).toBe(preDestroy);
  });

  it("supports optional imports (empty array is the simple case)", () => {
    const config = defineConfig({
      imports: [],
      beans: { logger: bean(Logger) },
    });

    expect(config.spec.imports).toEqual([]);
  });
});
