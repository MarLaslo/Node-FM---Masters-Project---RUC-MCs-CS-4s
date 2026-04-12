import { Node } from './Node.js';

export class FilterNode extends Node {
  constructor(x, y) {
    super('Filter', x, y);
    this.inputs = ['Audio In'];
    this.outputs = ['Audio Out'];

    this.cutoff = 1200;
    this.resonance = 0.707;
    this.envAmount = 2000;
    this.filterType = 0; // 0=LP, 1=BP, 2=HP
    this.slope = 0; // 0=12dB, 1=24dB

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
        paramName: 'cutoff',
        label: 'Cutoff',
        value: this.cutoff,
        min: 20,
        max: 20000,
        sensitivity: 460,
        x: this.x + 35,
        y: knobY,
        radius: 11,
        valueText: `${Math.round(this.cutoff)} Hz`
      },
      {
        paramName: 'resonance',
        label: 'Q',
        value: this.resonance,
        min: 0.1,
        max: 20,
        sensitivity: 200,
        x: this.x + 80,
        y: knobY,
        radius: 11,
        valueText: this.resonance.toFixed(2)
      },
      {
        paramName: 'envAmount',
        label: 'Env',
        value: this.envAmount,
        min: -10000,
        max: 10000,
        sensitivity: 420,
        x: this.x + 125,
        y: knobY,
        radius: 11,
        valueText: `${Math.round(this.envAmount)} Hz`
      }
    ];
  }

  drawParameters(ctx, hoveredKnobName = null) {
    ctx.fillStyle = '#1f2429';
    ctx.fillRect(this.x + 5, this.y + 40, this.width - 10, 50);

    for (const knob of this.getKnobs()) {
      this.drawKnob(ctx, knob, hoveredKnobName === knob.paramName);
    }

    const modeLabel = this.filterType <= 0.5 ? 'LP' : (this.filterType <= 1.5 ? 'BP' : 'HP');
    ctx.fillStyle = '#d7e6f4';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(modeLabel, this.x + this.width - 8, this.y + 18);
  }
}
