import * as Juce from "./juce/index.js";

console.log("This is JavaScript Frontend code running in the plugin UI context.");
console.log("window.__JUCE__ exists:", typeof window.__JUCE__ !== 'undefined');
console.log("window.LiteGraph exists:", typeof window.LiteGraph !== 'undefined');
console.log("window.graph exists:", typeof window.graph !== 'undefined');

window.__JUCE__.backend.addEventListener(
  "exampleEvent",
  (objectFromBackend) => {
    console.log("exampleEvent received:", objectFromBackend);
  }
);

window.__JUCE__.backend.addEventListener(
  "createNodeEvent",
  (nodeType) => {
    console.log("createNodeEvent received! nodeType:", nodeType);
    console.log("LiteGraph:", window.LiteGraph);
    console.log("graph:", window.graph);
    
    try {
      var my_add_node = window.LiteGraph.createNode(nodeType);
      console.log("Created node:", my_add_node);
      
      if (my_add_node) {
        my_add_node.pos = [400, 400];
        window.graph.add(my_add_node);
        console.log("Node added successfully to graph");
      } else {
        console.log("Failed to create node - type not registered");
        console.log("Available node types:", Object.keys(window.LiteGraph.registered_node_types));
      }
    } catch(e) {
      console.error("Error creating node:", e.message, e.stack);
    }
  }
);

console.log("Event listeners registered");

const data = window.__JUCE__.initialisationData;
document.getElementById("info").innerHTML = data.info;
 