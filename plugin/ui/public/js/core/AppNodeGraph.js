import { NodeGraph } from './NodeGraph.js';
import { OutputNode } from './nodes/OutputNode.js';

export class AppNodeGraph extends NodeGraph {
  createOutputNode(x, y) {
    return new OutputNode(x, y);
  }
}
