<script lang="ts">
  import DiProvider from "../../src/DiProvider.svelte";
  import type { Snippet } from "svelte";
  import { voidContainer } from "../helpers.js";

  type Props = { children: Snippet; instanceKey?: unknown };
  const { children, instanceKey } = $props<Props>();
</script>

<DiProvider container={voidContainer} {instanceKey}>
  {@render children()}
</DiProvider>
