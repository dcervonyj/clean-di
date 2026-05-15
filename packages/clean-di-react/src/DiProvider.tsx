import type { Container } from "clean-di";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { getOrCreateContext } from "./registry.js";

// Conditional config prop: omitted when TConfig=void, required otherwise.
type DiProviderProps<TConfig, TExposed> = {
  readonly container: Container<TConfig, TExposed>;
  readonly instanceKey?: unknown;
  readonly children: ReactNode;
} & ([TConfig] extends [void] ? object : { readonly config: TConfig });

export function DiProvider<TConfig, TExposed>(
  props: DiProviderProps<TConfig, TExposed>,
): ReactNode {
  const { container, instanceKey, children } = props;
  const config = "config" in props ? (props as { config: TConfig }).config : undefined;

  // Stable key that survives React 18 StrictMode remount (useRef persists across remounts).
  const keyRef = useRef<unknown>(instanceKey ?? Symbol("clean-di-react"));
  const stableKey = keyRef.current;

  // Call get() during render: synchronous, idempotent per key, no side-effects beyond caching.
  // Safe in React's concurrent rendering because same key always returns the same reference.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exposed: TExposed = (container as Container<any, TExposed>).get(
    config !== undefined ? { config, key: stableKey } : { key: stableKey },
  );

  // Deferred destroy: microtask deferral lets StrictMode's immediate remount cancel the
  // destroy before it fires. On a real unmount there is no remount, so it runs normally.
  const destroyScheduled = useRef(false);
  useEffect(() => {
    // Reset on every mount/remount, cancelling any pending destroy from prior cleanup.
    destroyScheduled.current = false;

    return () => {
      destroyScheduled.current = true;
      Promise.resolve().then(() => {
        if (destroyScheduled.current) {
          container.destroy(stableKey);
          destroyScheduled.current = false;
        }
      });
    };
  }, []);

  const Ctx = getOrCreateContext<TExposed>(container);
  return <Ctx.Provider value={exposed}>{children}</Ctx.Provider>;
}
