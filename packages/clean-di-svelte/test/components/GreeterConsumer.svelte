<script lang="ts">
  import { getExpose } from "../../src/getExpose.js";
  import { voidContainer } from "../helpers.js";

  const { greeter } = getExpose(voidContainer);
  const greeting = greeter.greet("World");
</script>

<span data-testid="greeting">{greeting}</span>
