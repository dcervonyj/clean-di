import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { createConnector } from "../src/createConnector.js";
import { configContainer, voidContainer } from "./helpers.js";

import ConnectorConsumer from "./components/ConnectorConsumer.svelte";
import VoidProviderWrapper from "./components/VoidProviderWrapper.svelte";

afterEach(() => {
  cleanup();
  voidContainer.destroyAll();
  configContainer.destroyAll();
});

describe("createConnector", () => {
  it("returns a connector with the container reference", () => {
    const connector = createConnector(voidContainer);

    expect(connector.container).toBe(voidContainer);
  });

  it("bound getExpose and getBean work inside a DiProvider subtree", () => {
    const { getByTestId } = render(VoidProviderWrapper, {
      props: { children: ConnectorConsumer as never },
    });

    expect(getByTestId("greeting-expose").textContent).toBe("Hello, Connector!");
    expect(getByTestId("greeting-bean").textContent).toBe("Hello, ConnectorBean!");
  });

  it("bound getExpose throws when called outside a provider", () => {
    const connector = createConnector(voidContainer);

    expect(() => connector.getExpose()).toThrow(
      "clean-di-svelte: getExpose() called outside a <DiProvider>",
    );
  });

  it("bound getBean throws when called outside a provider", () => {
    const connector = createConnector(voidContainer);

    expect(() => connector.getBean((e) => e.greeter)).toThrow(
      "clean-di-svelte: getExpose() called outside a <DiProvider>",
    );
  });
});
