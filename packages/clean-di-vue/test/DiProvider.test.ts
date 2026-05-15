import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { DiProvider } from "../src/DiProvider.js";
import { useExpose } from "../src/useExpose.js";

import { Greeter, configContainer, voidContainer } from "./helpers.js";

afterEach(() => {
  cleanup();
  voidContainer.destroyAll();
  configContainer.destroyAll();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GreeterDisplay = defineComponent({
  name: "GreeterDisplay",
  setup() {
    const { greeter } = useExpose(voidContainer);
    return () => h("span", { "data-testid": "out" }, greeter.greet("World"));
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DiProvider", () => {
  it("makes exposed beans available to useExpose inside the tree", () => {
    render(
      defineComponent({
        setup() {
          return () =>
            h(DiProvider, { container: voidContainer }, { default: () => h(GreeterDisplay) });
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
              DiProvider,
              { container: configContainer, config: { greeting: "Hi" } },
              { default: () => h(Display) },
            );
        },
      }),
    );

    expect(screen.getByTestId("out").textContent).toBe("Hello, Alice!");
  });

  it("calls container.destroy on unmount", () => {
    const destroySpy = vi.spyOn(voidContainer, "destroy");

    const { unmount } = render(
      defineComponent({
        setup() {
          return () =>
            h(DiProvider, { container: voidContainer }, { default: () => h(GreeterDisplay) });
        },
      }),
    );

    unmount();

    expect(destroySpy).toHaveBeenCalledOnce();
    destroySpy.mockRestore();
  });

  it("throws a clear error when useExpose is called outside a provider", () => {
    const Orphan = defineComponent({
      setup() {
        const { greeter } = useExpose(voidContainer);
        return () => h("span", greeter.greet("x"));
      },
    });

    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(Orphan)).toThrow(/clean-di-vue: useExpose\(\) called outside/);
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  it("returns the same Greeter instance from two useExpose calls with the same key", () => {
    let g1: Greeter | undefined;
    let g2: Greeter | undefined;

    const A = defineComponent({
      setup() {
        g1 = useExpose(voidContainer).greeter;
        return () => null;
      },
    });

    const B = defineComponent({
      setup() {
        g2 = useExpose(voidContainer).greeter;
        return () => null;
      },
    });

    render(
      defineComponent({
        setup() {
          return () => h(DiProvider, { container: voidContainer }, { default: () => [h(A), h(B)] });
        },
      }),
    );

    expect(g1).toBeInstanceOf(Greeter);
    expect(g1).toBe(g2);
  });
});
