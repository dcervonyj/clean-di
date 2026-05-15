import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";

import { createConnector } from "../src/createConnector.js";
import { useExpose } from "../src/useExpose.js";

import type { Greeter} from "./helpers.js";
import { voidContainer, configContainer } from "./helpers.js";

afterEach(() => {
  cleanup();
  voidContainer.destroyAll();
  configContainer.destroyAll();
});

const { Provider, fullConnect, connect } = createConnector(voidContainer);
const configConnector = createConnector(configContainer);

describe("createConnector", () => {
  describe("Provider", () => {
    it("makes beans available to useExpose inside the tree", () => {
      function Display(): React.ReactElement {
        const { greeter } = useExpose(voidContainer);
        return <span data-testid="out">{greeter.greet("World")}</span>;
      }

      render(
        <Provider container={voidContainer}>
          <Display />
        </Provider>,
      );

      expect(screen.getByTestId("out").textContent).toBe("Hello, World!");
    });

    it("accepts a config prop for config-bearing containers", () => {
      function Display(): React.ReactElement {
        const { greeter } = useExpose(configContainer);
        return <span data-testid="out">{greeter.greet("Alice")}</span>;
      }

      render(
        <configConnector.Provider container={configContainer} config={{ greeting: "Hi" }}>
          <Display />
        </configConnector.Provider>,
      );

      expect(screen.getByTestId("out").textContent).toBe("Hello, Alice!");
    });
  });

  describe("fullConnect", () => {
    it("injects all exposed beans as props and removes them from the external signature", () => {
      interface Props {
        greeter: Greeter;
        suffix: string;
      }

      function View({ greeter, suffix }: Props): React.ReactElement {
        return <span data-testid="out">{greeter.greet("World") + suffix}</span>;
      }

      const Connected = fullConnect(View);

      render(
        <Provider container={voidContainer}>
          <Connected suffix="!" />
        </Provider>,
      );

      expect(screen.getByTestId("out").textContent).toBe("Hello, World!!");
    });

    it("sets displayName on the wrapper component", () => {
      function MyComponent(): null {
        return null;
      }

      const Connected = fullConnect(MyComponent);

      expect(Connected.displayName).toBe("Connected(MyComponent)");
    });

    it("own props take precedence over injected bean props", () => {
      interface Props {
        greeter: Greeter;
      }

      const customGreeter = { greet: (_: string) => "Overridden!" } as unknown as Greeter;

      function View({ greeter }: Props): React.ReactElement {
        return <span data-testid="out">{greeter.greet("Bob")}</span>;
      }

      const Connected = fullConnect(View);

      render(
        <Provider container={voidContainer}>
          <Connected greeter={customGreeter} />
        </Provider>,
      );

      expect(screen.getByTestId("out").textContent).toBe("Overridden!");
    });
  });

  describe("connect", () => {
    it("injects only the selected keys as props", () => {
      interface Props {
        greeter: Greeter;
        extra: string;
      }

      function View({ greeter, extra }: Props): React.ReactElement {
        return (
          <span data-testid="out">
            {greeter.greet("Bob")}-{extra}
          </span>
        );
      }

      const Connected = connect(View, "greeter");

      render(
        <Provider container={voidContainer}>
          <Connected extra="ok" />
        </Provider>,
      );

      expect(screen.getByTestId("out").textContent).toBe("Hello, Bob!-ok");
    });

    it("sets displayName on the wrapper component", () => {
      function AnotherComponent(): null {
        return null;
      }

      const Connected = connect(AnotherComponent, "greeter");

      expect(Connected.displayName).toBe("Connected(AnotherComponent)");
    });
  });

  describe("Provider destroy lifecycle", () => {
    it("calls container.destroy on unmount", async () => {
      const destroySpy = vi.spyOn(voidContainer, "destroy");

      function View(): React.ReactElement {
        const { greeter } = useExpose(voidContainer);
        return <span>{greeter.greet("x")}</span>;
      }

      const { unmount } = render(
        <Provider container={voidContainer}>
          <View />
        </Provider>,
      );

      unmount();
      await Promise.resolve();

      expect(destroySpy).toHaveBeenCalledOnce();
      destroySpy.mockRestore();
    });
  });
});
