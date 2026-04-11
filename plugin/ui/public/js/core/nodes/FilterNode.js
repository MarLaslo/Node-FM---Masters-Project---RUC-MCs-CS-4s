import { emitToBackend } from '../backendApi.js';
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

  getKnobAt(x, y) {
    for (const knob of this.getKnobs()) {
      const dx = x - knob.x;
      const dy = y - knob.y;
      if (Math.sqrt(dx * dx + dy * dy) <= knob.radius + 3) {
        return knob;
      }
    }
    return null;
  }

  onParameterClick(x, y, graph) {
    const knob = this.getKnobAt(x, y);
    if (!knob) {
      return false;
    }

    graph.beginKnobAdjustment(this, knob, y);
    return true;
  }

  drawKnob(ctx, knob, isHovered) {
    const normalized = (knob.value - knob.min) / (knob.max - knob.min);
    const startAngle = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const valueAngle = startAngle + normalized * sweep;

    ctx.beginPath();
    ctx.arc(knob.x, knob.y, knob.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#2a2f34';
    ctx.fill();
    ctx.strokeStyle = isHovered ? '#ffb347' : '#5fb3ff';
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(knob.x, knob.y, knob.radius + 3, startAngle, startAngle + sweep);
    ctx.strokeStyle = '#46515a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(knob.x, knob.y, knob.radius + 3, startAngle, valueAngle);
    ctx.strokeStyle = '#7ac7ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    const pointerLen = knob.radius - 4;
    ctx.beginPath();
    ctx.moveTo(knob.x, knob.y);
    ctx.lineTo(
      knob.x + Math.cos(valueAngle) * pointerLen,
      knob.y + Math.sin(valueAngle) * pointerLen
    );
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#aeb9c2';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(knob.label, knob.x, knob.y - knob.radius - 7);

    ctx.fillStyle = '#7ac7ff';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(knob.valueText || knob.value.toFixed(2), knob.x, knob.y + knob.radius + 12);
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

  updateParameter(paramName, value) {
    if (!this.backendId) {
      return;
    }

    emitToBackend({
      type: 'UPDATE_NODE_PARAMETER',
      data: {
        nodeId: this.backendId,
        paramName,
        value
      }
    });
  }
}
