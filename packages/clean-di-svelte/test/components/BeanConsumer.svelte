<script lang="ts">
  import { getBean } from "../../src/getBean.js";
  import { voidContainer } from "../helpers.js";

  const greeter = getBean(voidContainer, (e) => e.greeter);
  const greeting = greeter.greet("Bean");
</script>

<span data-testid="greeting">{greeting}</span>
