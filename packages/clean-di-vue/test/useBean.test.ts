import { cleanup, render, screen } from "@testing-library/vue";
import { defineComponent, h } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useBean } from "../src/useBean.js";
import { useExpose } from "../src/useExpose.js";
import { DiProvider } from "../src/DiProvider.js";

import { Greeter, voidContainer } from "./helpers.js";

afterEach(() => {
  cleanup();
  voidContainer.destroyAll();
});

describe("useBean", () => {
  it("returns the selected bean from the nearest provider", () => {
    const Display = defineComponent({
      setup() {
        const greeter = useBean(voidContainer, (e) => e.greeter);
        return () => h("span", { "data-testid": "out" }, greeter.greet("Bob"));
      },
    });

    render(
      defineComponent({
        setup() {
          return () => h(DiProvider, { container: voidContainer }, { default: () => h(Display) });
        },
      }),
    );

    expect(screen.getByTestId("out").textContent).toBe("Hello, Bob!");
  });

  it("applies the selector and returns the correct type", () => {
    let captured: Greeter | undefined;

    const Probe = defineComponent({
      setup() {
        captured = useBean(voidContainer, (e) => e.greeter);
        return () => null;
      },
    });

    render(
      defineComponent({
        setup() {
          return () => h(DiProvider, { container: voidContainer }, { default: () => h(Probe) });
        },
      }),
    );

    expect(captured).toBeInstanceOf(Greeter);
  });

  it("propagates the missing-provider error from useExpose", () => {
    const Orphan = defineComponent({
      setup() {
        useBean(voidContainer, (e) => e.greeter);
        return () => null;
      },
    });

    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(Orphan)).toThrow(/useExpose\(\) called outside/);
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  it("useExpose and useBean return the same bean instance", () => {
    let fromExpose: Greeter | undefined;
    let fromBean: Greeter | undefined;

    const Probe = defineComponent({
      setup() {
        fromExpose = useExpose(voidContainer).greeter;
        fromBean = useBean(voidContainer, (e) => e.greeter);
        return () => null;
      },
    });

    render(
      defineComponent({
        setup() {
          return () => h(DiProvider, { container: voidContainer }, { default: () => h(Probe) });
        },
      }),
    );

    expect(fromExpose).toBeInstanceOf(Greeter);
    expect(fromExpose).toBe(fromBean);
  });
});
