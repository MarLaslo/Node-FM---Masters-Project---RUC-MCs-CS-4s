import { Node } from './Node.js';

export class OperatorNode extends Node {
  constructor(x, y) {
    super('Operator', x, y);
    this.inputs = ['FM In'];
    this.outputs = ['Audio'];
    this.frequencyRatio = 1.0;
    this.ratio = 1.0;
    this.amplitude = 0.5;

    this.attack = 0.01;
    this.decay = 0.1;
    this.sustain = 0.7;
    this.release = 0.3;

    this.height = 95;
  }

  getKnobs() {
    const knobY = this.y + 68;
    return [
      {
        paramName: 'frequencyRatio',
        label: 'Ratio',
        value: this.frequencyRatio,
        min: 0.125,
        max: 8,
        sensitivity: 140,
        x: this.x + 48,
        y: knobY,
        radius: 12,
        valueText: this.frequencyRatio.toFixed(3)
      },
      {
        paramName: 'amplitude',
        label: 'Amp',
        value: this.amplitude,
        min: 0,
        max: 1,
        sensitivity: 140,
        x: this.x + 112,
        y: knobY,
        radius: 12,
        valueText: this.amplitude.toFixed(3)
      }
    ];
  }

  drawParameters(ctx, hoveredKnobName = null) {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(this.x + 5, this.y + 40, this.width - 10, 50);

    for (const knob of this.getKnobs()) {
      this.drawKnob(ctx, knob, hoveredKnobName === knob.paramName);
    }
  }
}
