<script lang="ts">
  import { getExpose } from "../../src/getExpose.js";
  import { configContainer } from "../helpers.js";

  const { greeter } = getExpose(configContainer);
  const greeting = greeter.greet("World");
</script>

<span data-testid="greeting">{greeting}</span>
