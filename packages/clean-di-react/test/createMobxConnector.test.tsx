import { render, screen, act, cleanup } from "@testing-library/react";
import { makeObservable, observable, runInAction } from "mobx";
import React from "react";
import { describe, it, expect, afterEach } from "vitest";

import { createMobxConnector } from "../src/mobx/createMobxConnector.js";
import { useExpose } from "../src/useExpose.js";

import type { Greeter} from "./helpers.js";
import { voidContainer } from "./helpers.js";

afterEach(() => {
  cleanup();
  voidContainer.destroyAll();
});

const { Provider, fullConnect, connect } = createMobxConnector(voidContainer);

describe("createMobxConnector", () => {
  it("Provider makes beans available via useExpose", () => {
    function Display(): React.ReactElement {
      const { greeter } = useExpose(voidContainer);
      return <span data-testid="out">{greeter.greet("MobX")}</span>;
    }

    render(
      <Provider container={voidContainer}>
        <Display />
      </Provider>,
    );

    expect(screen.getByTestId("out").textContent).toBe("Hello, MobX!");
  });

  it("fullConnect re-renders when a MobX observable changes (proves observer wrapping)", async () => {
    class Store {
      suffix = "!";
      constructor() {
        makeObservable(this, { suffix: observable });
      }
    }
    const store = new Store();

    interface Props {
      greeter: Greeter;
    }

    function View({ greeter }: Props): React.ReactElement {
      return (
        <span data-testid="out">
          {greeter.greet("World")}
          {store.suffix}
        </span>
      );
    }

    const Connected = fullConnect(View);

    render(
      <Provider container={voidContainer}>
        <Connected />
      </Provider>,
    );

    expect(screen.getByTestId("out").textContent).toBe("Hello, World!!");

    await act(async () => {
      runInAction(() => {
        store.suffix = "?";
      });
    });

    expect(screen.getByTestId("out").textContent).toBe("Hello, World!?");
  });

  it("connect re-renders when a MobX observable changes (proves observer wrapping)", async () => {
    class Store {
      suffix = "!";
      constructor() {
        makeObservable(this, { suffix: observable });
      }
    }
    const store = new Store();

    interface Props {
      greeter: Greeter;
    }

    function View({ greeter }: Props): React.ReactElement {
      return (
        <span data-testid="out">
          {greeter.greet("World")}
          {store.suffix}
        </span>
      );
    }

    const Connected = connect(View, "greeter");

    render(
      <Provider container={voidContainer}>
        <Connected />
      </Provider>,
    );

    expect(screen.getByTestId("out").textContent).toBe("Hello, World!!");

    await act(async () => {
      runInAction(() => {
        store.suffix = "?";
      });
    });

    expect(screen.getByTestId("out").textContent).toBe("Hello, World!?");
  });

  it("fullConnect injects all beans and renders correctly", () => {
    interface Props {
      greeter: Greeter;
    }

    function View({ greeter }: Props): React.ReactElement {
      return <span data-testid="out">{greeter.greet("Observer")}</span>;
    }

    const Connected = fullConnect(View);

    render(
      <Provider container={voidContainer}>
        <Connected />
      </Provider>,
    );

    expect(screen.getByTestId("out").textContent).toBe("Hello, Observer!");
  });

  it("connect injects only selected keys", () => {
    interface Props {
      greeter: Greeter;
    }

    function View({ greeter }: Props): React.ReactElement {
      return <span data-testid="out">{greeter.greet("Selective")}</span>;
    }

    const Connected = connect(View, "greeter");

    render(
      <Provider container={voidContainer}>
        <Connected />
      </Provider>,
    );

    expect(screen.getByTestId("out").textContent).toBe("Hello, Selective!");
  });
});
