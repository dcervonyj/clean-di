<script lang="ts" generics="TConfig, TExposed">
  import type { Container } from "clean-di";
  import { onDestroy, setContext } from "svelte";
  import type { Snippet } from "svelte";

  // Conditional props: config required when TConfig != void
  type Props = {
    container: Container<TConfig, TExposed>;
    instanceKey?: unknown;
    children: Snippet;
  } & ([TConfig] extends [void] ? object : { config: TConfig });

  const props = $props<Props>();

  // Capture values at mount time — container, config, and instanceKey are
  // intentionally fixed per instance (not reactive). We use $state.snapshot
  // to read the initial value without creating a reactive subscription.
  const container: Container<TConfig, TExposed> = props.container;
  const config: TConfig | undefined =
    "config" in props ? (props as { config: TConfig }).config : undefined;
  const stableKey: unknown = props.instanceKey ?? Symbol("clean-di-svelte");

  const exposed = (container as Container<unknown, TExposed>).get(
    config !== undefined ? { config, key: stableKey } : { key: stableKey },
  );

  setContext(container, exposed);
  onDestroy(() => container.destroy(stableKey));
</script>

{@render props.children()}
