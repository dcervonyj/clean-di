<script lang="ts">
  import DiProvider from "../../src/DiProvider.svelte";
  import type { Snippet } from "svelte";
  import type { AppConfig } from "../helpers.js";
  import { configContainer } from "../helpers.js";

  type Props = { config: AppConfig; children: Snippet; instanceKey?: unknown };
  const { config, children, instanceKey } = $props<Props>();
</script>

<DiProvider container={configContainer} {config} {instanceKey}>
  {@render children()}
</DiProvider>
