import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { getBean } from "../src/getBean.js";


import BeanConsumer from "./components/BeanConsumer.svelte";
import VoidProviderWrapper from "./components/VoidProviderWrapper.svelte";
import { configContainer, voidContainer } from "./helpers.js";

afterEach(() => {
  cleanup();
  voidContainer.destroyAll();
  configContainer.destroyAll();
});

describe("getBean", () => {
  it("selector returns the correct bean", () => {
    const { getByTestId } = render(VoidProviderWrapper, {
      props: { children: BeanConsumer as never },
    });

    expect(getByTestId("greeting").textContent).toBe("Hello, Bean!");
  });

  it("missing-provider error propagates from getBean", () => {
    expect(() => getBean(voidContainer, (e) => e.greeter)).toThrow(
      "clean-di-svelte: getExpose() called outside a <DiProvider>",
    );
  });
});
