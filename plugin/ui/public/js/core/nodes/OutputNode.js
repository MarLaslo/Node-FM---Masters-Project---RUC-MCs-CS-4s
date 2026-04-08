import { Node } from './Node.js';

export class OutputNode extends Node {
  constructor(x, y) {
    super('Output', x, y);
    this.inputs = ['Audio'];
  }
}
