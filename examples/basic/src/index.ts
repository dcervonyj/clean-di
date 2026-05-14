import { greeterContext } from "./GreeterContext.di.generated.js";

const container = greeterContext.get({ config: { name: "World" } });
const greeting = container.greeter.greet();
console.log(greeting);
