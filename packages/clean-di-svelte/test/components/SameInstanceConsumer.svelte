<script lang="ts">
  import { getExpose } from "../../src/getExpose.js";
  import { voidContainer } from "../helpers.js";

  const exposed1 = getExpose(voidContainer);
  const exposed2 = getExpose(voidContainer);
  const same = exposed1 === exposed2;
</script>

<span data-testid="same">{String(same)}</span>
