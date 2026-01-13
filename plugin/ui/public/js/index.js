import * as Juce from "./juce/index.js";

console.log("This is JavaScript Frondend code running in the plugin UI context.");

window.__JUCE__.backend.addEventListener(
  "exampleEvent",
  (objectFromBackend) => {
    console.log(objectFromBackend);
  }
);