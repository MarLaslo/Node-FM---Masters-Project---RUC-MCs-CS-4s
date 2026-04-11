import * as Juce from './juce/index.js';
import { BackendBridge } from './core/BackendBridge.js';
import { AppNodeGraph } from './core/AppNodeGraph.js';

void Juce;

console.log('NodeFM Frontend initializing...');

const canvas = document.getElementById('canvas');
const graph = new AppNodeGraph(canvas);
const backendBridge = new BackendBridge(graph);

window.nodeGraph = graph;

backendBridge.initializeInfo();
backendBridge.setup();

graph.setCanvasDoubleClickHandler((position) => {
  backendBridge.requestAddOperator(position);
});

document.getElementById('addOperatorBtn').addEventListener('click', () => {
  backendBridge.requestAddOperator();
});

document.getElementById('clearGraphBtn').addEventListener('click', () => {
  graph.clear();
});

document.getElementById('zoomInBtn').addEventListener('click', () => {
  graph.zoomIn();
});

document.getElementById('zoomOutBtn').addEventListener('click', () => {
  graph.zoomOut();
});

document.getElementById('zoomResetBtn').addEventListener('click', () => {
  graph.resetZoom();
});

console.log('NodeFM Frontend initialized');
