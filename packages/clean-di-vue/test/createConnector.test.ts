import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { createConnector } from "../src/createConnector.js";
import { useExpose } from "../src/useExpose.js";

import type { Greeter } from "./helpers.js";
import { configContainer, voidContainer } from "./helpers.js";

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
      const Display = defineComponent({
        setup() {
          const { greeter } = useExpose(voidContainer);
          return () => h("span", { "data-testid": "out" }, greeter.greet("World"));
        },
      });

      render(
        defineComponent({
          setup() {
            return () => h(Provider, { container: voidContainer }, { default: () => h(Display) });
          },
        }),
      );

      expect(screen.getByTestId("out").textContent).toBe("Hello, World!");
    });

    it("accepts a config prop for config-bearing containers", () => {
      const Display = defineComponent({
        setup() {
          const { greeter } = useExpose(configContainer);
          return () => h("span", { "data-testid": "out" }, greeter.greet("Alice"));
        },
      });

      render(
        defineComponent({
          setup() {
            return () =>
              h(
                configConnector.Provider,
                { container: configContainer, config: { greeting: "Hi" } },
                { default: () => h(Display) },
              );
          },
        }),
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

      const View = defineComponent({
        props: ["greeter", "suffix"],
        setup(props: Props) {
          return () =>
            h("span", { "data-testid": "out" }, props.greeter.greet("World") + props.suffix);
        },
      });

      const Connected = fullConnect(View);

      render(
        defineComponent({
          setup() {
            return () =>
              h(
                Provider,
                { container: voidContainer },
                { default: () => h(Connected, { suffix: "!" }) },
              );
          },
        }),
      );

      expect(screen.getByTestId("out").textContent).toBe("Hello, World!!");
    });

    it("sets name on the wrapper component for devtools", () => {
      const MyComponent = defineComponent({ name: "MyComponent", setup: () => () => null });
      const Connected = fullConnect(MyComponent);
      expect((Connected as { name?: string }).name).toBe("Connected(MyComponent)");
    });

    it("own props take precedence over injected bean props", () => {
      interface Props {
        greeter: Greeter;
      }

      const customGreeter = { greet: (_: string) => "Overridden!" } as unknown as Greeter;

      const View = defineComponent({
        props: ["greeter"],
        setup(props: Props) {
          return () => h("span", { "data-testid": "out" }, props.greeter.greet("Bob"));
        },
      });

      const Connected = fullConnect(View);

      render(
        defineComponent({
          setup() {
            return () =>
              h(
                Provider,
                { container: voidContainer },
                { default: () => h(Connected, { greeter: customGreeter }) },
              );
          },
        }),
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

      const View = defineComponent({
        props: ["greeter", "extra"],
        setup(props: Props) {
          return () =>
            h("span", { "data-testid": "out" }, `${props.greeter.greet("Bob")}-${props.extra}`);
        },
      });

      const Connected = connect(View, "greeter");

      render(
        defineComponent({
          setup() {
            return () =>
              h(
                Provider,
                { container: voidContainer },
                { default: () => h(Connected, { extra: "ok" }) },
              );
          },
        }),
      );

      expect(screen.getByTestId("out").textContent).toBe("Hello, Bob!-ok");
    });

    it("sets name on the wrapper component for devtools", () => {
      const AnotherComponent = defineComponent({
        name: "AnotherComponent",
        setup: () => () => null,
      });
      const Connected = connect(AnotherComponent, "greeter");
      expect((Connected as { name?: string }).name).toBe("Connected(AnotherComponent)");
    });
  });

  describe("Provider destroy lifecycle", () => {
    it("calls container.destroy on unmount", () => {
      const destroySpy = vi.spyOn(voidContainer, "destroy");

      const View = defineComponent({
        setup() {
          const { greeter } = useExpose(voidContainer);
          return () => h("span", greeter.greet("x"));
        },
      });

      const { unmount } = render(
        defineComponent({
          setup() {
            return () => h(Provider, { container: voidContainer }, { default: () => h(View) });
          },
        }),
      );

      unmount();

      expect(destroySpy).toHaveBeenCalledOnce();
      destroySpy.mockRestore();
    });
  });
});
