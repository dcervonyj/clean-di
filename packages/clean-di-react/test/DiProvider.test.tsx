import { render, screen, act, cleanup } from "@testing-library/react";
import React, { StrictMode } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";

import { DiProvider } from "../src/DiProvider.js";
import { useExpose } from "../src/useExpose.js";

import { Greeter, voidContainer, configContainer } from "./helpers.js";

afterEach(() => {
  cleanup();
  voidContainer.destroyAll();
  configContainer.destroyAll();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function GreeterDisplay(): React.ReactElement {
  const { greeter } = useExpose(voidContainer);
  return <span data-testid="out">{greeter.greet("World")}</span>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DiProvider", () => {
  it("makes exposed beans available to useExpose inside the tree", () => {
    render(
      <DiProvider container={voidContainer}>
        <GreeterDisplay />
      </DiProvider>,
    );

    expect(screen.getByTestId("out").textContent).toBe("Hello, World!");
  });

  it("accepts a config prop for config-bearing containers", () => {
    function Display(): React.ReactElement {
      const { greeter } = useExpose(configContainer);
      return <span data-testid="out">{greeter.greet("Alice")}</span>;
    }

    render(
      <DiProvider container={configContainer} config={{ greeting: "Hi" }}>
        <Display />
      </DiProvider>,
    );

    expect(screen.getByTestId("out").textContent).toBe("Hello, Alice!");
  });

  it("calls container.destroy on unmount", async () => {
    const destroySpy = vi.spyOn(voidContainer, "destroy");

    const { unmount } = render(
      <DiProvider container={voidContainer}>
        <GreeterDisplay />
      </DiProvider>,
    );

    unmount();
    // Destroy is deferred by one microtask.
    await Promise.resolve();

    expect(destroySpy).toHaveBeenCalledOnce();
    destroySpy.mockRestore();
  });

  it("does NOT destroy on StrictMode double-mount (remount cancels deferred destroy)", async () => {
    const destroySpy = vi.spyOn(voidContainer, "destroy");

    const { unmount } = render(
      <StrictMode>
        <DiProvider container={voidContainer}>
          <GreeterDisplay />
        </DiProvider>
      </StrictMode>,
    );

    // After StrictMode mount/unmount/remount, the microtask from the first
    // cleanup should have been cancelled by the second setup.
    await act(async () => {
      await Promise.resolve();
    });

    expect(destroySpy).not.toHaveBeenCalled();

    // Actual unmount should still trigger destroy.
    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(destroySpy).toHaveBeenCalledOnce();
    destroySpy.mockRestore();
  });

  it("throws a clear error when useExpose is called outside a provider", () => {
    function Orphan(): React.ReactElement {
      const { greeter } = useExpose(voidContainer);
      return <span>{greeter.greet("x")}</span>;
    }

    // Suppress React's console.error for the thrown error boundary output.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Orphan />)).toThrow(/clean-di-react: useExpose\(\) called outside/);
    consoleError.mockRestore();
  });

  it("returns the same Greeter instance from two useExpose calls with the same key", () => {
    let g1: Greeter | undefined;
    let g2: Greeter | undefined;

    function A(): null {
      g1 = useExpose(voidContainer).greeter;
      return null;
    }
    function B(): null {
      g2 = useExpose(voidContainer).greeter;
      return null;
    }

    render(
      <DiProvider container={voidContainer}>
        <A />
        <B />
      </DiProvider>,
    );

    expect(g1).toBeInstanceOf(Greeter);
    expect(g1).toBe(g2);
  });
});
