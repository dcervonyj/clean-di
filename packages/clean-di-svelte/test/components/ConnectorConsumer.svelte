<script lang="ts">
  import { createConnector } from "../../src/createConnector.js";
  import { voidContainer } from "../helpers.js";

  const connector = createConnector(voidContainer);
  const exposed = connector.getExpose();
  const greeterViaBean = connector.getBean((e) => e.greeter);
  const greetingExpose = exposed.greeter.greet("Connector");
  const greetingBean = greeterViaBean.greet("ConnectorBean");
</script>

<span data-testid="greeting-expose">{greetingExpose}</span>
<span data-testid="greeting-bean">{greetingBean}</span>
