import { emitToBackend } from '../backendApi.js';
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
        sensitivity: 180,
        x: this.x + 48,
        y: knobY,
        radius: 12
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
        radius: 12
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

  drawKnob(ctx, knob, isHovered) {
    const normalized = (knob.value - knob.min) / (knob.max - knob.min);
    const startAngle = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const valueAngle = startAngle + normalized * sweep;

    ctx.beginPath();
    ctx.arc(knob.x, knob.y, knob.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#2f2f2f';
    ctx.fill();
    ctx.strokeStyle = isHovered ? '#ff9800' : '#4a90e2';
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(knob.x, knob.y, knob.radius + 3, startAngle, startAngle + sweep);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(knob.x, knob.y, knob.radius + 3, startAngle, valueAngle);
    ctx.strokeStyle = '#6ab0f3';
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

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(knob.label, knob.x, knob.y - knob.radius - 7);

    ctx.fillStyle = '#6ab0f3';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(knob.value.toFixed(3), knob.x, knob.y + knob.radius + 12);
  }

  drawParameters(ctx, hoveredKnobName = null) {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(this.x + 5, this.y + 40, this.width - 10, 50);

    for (const knob of this.getKnobs()) {
      this.drawKnob(ctx, knob, hoveredKnobName === knob.paramName);
    }
  }

  onParameterClick(x, y, graph) {
    const knob = this.getKnobAt(x, y);
    if (knob) {
      graph.beginKnobAdjustment(this, knob, y);
      return true;
    }
    return false;
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
