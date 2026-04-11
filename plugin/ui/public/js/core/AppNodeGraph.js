import { NodeGraph } from './NodeGraph.js';
import { FilterNode } from './nodes/FilterNode.js';
import { OutputNode } from './nodes/OutputNode.js';

export class AppNodeGraph extends NodeGraph {
  createFilterNode(x, y) {
    return new FilterNode(x, y);
  }

  createOutputNode(x, y) {
    return new OutputNode(x, y);
  }
}
