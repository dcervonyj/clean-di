import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getExpose } from "../src/getExpose.js";

import ConfigGreeterConsumer from "./components/ConfigGreeterConsumer.svelte";
import ConfigProviderWrapper from "./components/ConfigProviderWrapper.svelte";
import GreeterConsumer from "./components/GreeterConsumer.svelte";
import SameInstanceConsumer from "./components/SameInstanceConsumer.svelte";
import VoidProviderWrapper from "./components/VoidProviderWrapper.svelte";
import { configContainer, voidContainer } from "./helpers.js";

afterEach(() => {
  cleanup();
  voidContainer.destroyAll();
  configContainer.destroyAll();
});

describe("DiProvider", () => {
  it("makes beans available to getExpose inside the tree", () => {
    const { getByTestId } = render(VoidProviderWrapper, {
      props: { children: GreeterConsumer as never },
    });

    expect(getByTestId("greeting").textContent).toBe("Hello, World!");
  });

  it("accepts config prop and passes it to the container", () => {
    const { getByTestId } = render(ConfigProviderWrapper, {
      props: {
        config: { greeting: "Hi" },
        children: ConfigGreeterConsumer as never,
      },
    });

    expect(getByTestId("greeting").textContent).toBe("Hello, World!");
  });

  it("returns the same instance from two getExpose calls in the same subtree", () => {
    const { getByTestId } = render(VoidProviderWrapper, {
      props: { children: SameInstanceConsumer as never },
    });

    expect(getByTestId("same").textContent).toBe("true");
  });

  it("calls container.destroy on component unmount", () => {
    const destroySpy = vi.spyOn(voidContainer, "destroy");
    const instanceKey = Symbol("test-key");

    const { unmount } = render(VoidProviderWrapper, {
      props: { instanceKey, children: GreeterConsumer as never },
    });

    expect(destroySpy).not.toHaveBeenCalled();
    unmount();
    expect(destroySpy).toHaveBeenCalledWith(instanceKey);

    destroySpy.mockRestore();
  });

  it("throws a clear error when getExpose is called outside a provider", () => {
    expect(() => getExpose(voidContainer)).toThrow(
      "clean-di-svelte: getExpose() called outside a <DiProvider>",
    );
  });
});
