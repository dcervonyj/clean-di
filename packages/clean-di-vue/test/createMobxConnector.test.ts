import { cleanup, render, screen } from "@testing-library/vue";
import { makeObservable, observable, runInAction } from "mobx";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";

import { createMobxConnector } from "../src/mobx/createMobxConnector.js";
import { useExpose } from "../src/useExpose.js";

import type { Greeter } from "./helpers.js";
import { voidContainer } from "./helpers.js";

afterEach(() => {
  cleanup();
  voidContainer.destroyAll();
});

const { Provider, fullConnect, connect } = createMobxConnector(voidContainer);

describe("createMobxConnector", () => {
  it("Provider makes beans available via useExpose", () => {
    const Display = defineComponent({
      setup() {
        const { greeter } = useExpose(voidContainer);
        return () => h("span", { "data-testid": "out" }, greeter.greet("MobX"));
      },
    });

    render(
      defineComponent({
        setup() {
          return () => h(Provider, { container: voidContainer }, { default: () => h(Display) });
        },
      }),
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

    const View = defineComponent({
      props: ["greeter"],
      setup(props: Props) {
        return () =>
          h("span", { "data-testid": "out" }, `${props.greeter.greet("World")}${store.suffix}`);
      },
    });

    const Connected = fullConnect(View);

    render(
      defineComponent({
        setup() {
          return () => h(Provider, { container: voidContainer }, { default: () => h(Connected) });
        },
      }),
    );

    expect(screen.getByTestId("out").textContent).toBe("Hello, World!!");

    runInAction(() => {
      store.suffix = "?";
    });
    await nextTick();

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

    const View = defineComponent({
      props: ["greeter"],
      setup(props: Props) {
        return () =>
          h("span", { "data-testid": "out" }, `${props.greeter.greet("World")}${store.suffix}`);
      },
    });

    const Connected = connect(View, "greeter");

    render(
      defineComponent({
        setup() {
          return () => h(Provider, { container: voidContainer }, { default: () => h(Connected) });
        },
      }),
    );

    expect(screen.getByTestId("out").textContent).toBe("Hello, World!!");

    runInAction(() => {
      store.suffix = "?";
    });
    await nextTick();

    expect(screen.getByTestId("out").textContent).toBe("Hello, World!?");
  });

  it("fullConnect injects all beans and renders correctly", () => {
    interface Props {
      greeter: Greeter;
    }

    const View = defineComponent({
      props: ["greeter"],
      setup(props: Props) {
        return () => h("span", { "data-testid": "out" }, props.greeter.greet("Observer"));
      },
    });

    const Connected = fullConnect(View);

    render(
      defineComponent({
        setup() {
          return () => h(Provider, { container: voidContainer }, { default: () => h(Connected) });
        },
      }),
    );

    expect(screen.getByTestId("out").textContent).toBe("Hello, Observer!");
  });

  it("connect injects only selected keys", () => {
    interface Props {
      greeter: Greeter;
    }

    const View = defineComponent({
      props: ["greeter"],
      setup(props: Props) {
        return () => h("span", { "data-testid": "out" }, props.greeter.greet("Selective"));
      },
    });

    const Connected = connect(View, "greeter");

    render(
      defineComponent({
        setup() {
          return () => h(Provider, { container: voidContainer }, { default: () => h(Connected) });
        },
      }),
    );

    expect(screen.getByTestId("out").textContent).toBe("Hello, Selective!");
  });
});
