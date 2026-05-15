import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi } from "vitest";

import { DiProvider } from "../src/DiProvider.js";
import { useBean } from "../src/useBean.js";

import { Greeter, voidContainer } from "./helpers.js";

describe("useBean", () => {
  it("returns the selected bean from the nearest provider", () => {
    function Display(): React.ReactElement {
      const greeter = useBean(voidContainer, (e) => e.greeter);
      return <span data-testid="out">{greeter.greet("Bob")}</span>;
    }

    render(
      <DiProvider container={voidContainer}>
        <Display />
      </DiProvider>,
    );

    expect(screen.getByTestId("out").textContent).toBe("Hello, Bob!");
  });

  it("applies the selector and returns the correct type", () => {
    let captured: Greeter | undefined;

    function Probe(): null {
      captured = useBean(voidContainer, (e) => e.greeter);
      return null;
    }

    render(
      <DiProvider container={voidContainer}>
        <Probe />
      </DiProvider>,
    );

    expect(captured).toBeInstanceOf(Greeter);
  });

  it("propagates the missing-provider error from useExpose", () => {
    function Orphan(): null {
      useBean(voidContainer, (e) => e.greeter);
      return null;
    }

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Orphan />)).toThrow(/useExpose\(\) called outside/);
    consoleError.mockRestore();
  });
});
