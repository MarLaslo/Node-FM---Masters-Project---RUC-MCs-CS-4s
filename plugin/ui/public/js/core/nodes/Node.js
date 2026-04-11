import { emitToBackend } from '../api/backendApi.js';

const KNOB_STYLE = {
  bodyFill: '#2f2f2f',
  hoverStroke: '#ff9800',
  stroke: '#4a90e2',
  ringBackground: '#444',
  ringValue: '#6ab0f3',
  pointer: '#ffffff',
  labelColor: '#aaaaaa',
  labelFont: '9px monospace',
  valueColor: '#6ab0f3',
  valueFont: 'bold 10px monospace'
};

export class Node {
  constructor(title, x, y) {
    this.title = title;
    this.x = x;
    this.y = y;
    this.width = 160;
    this.height = 80;
    this.inputs = [];
    this.outputs = [];
    this.backendId = null;
  }

  getInputPortPosition(index) {
    const portY = this.y + 35 + index * 20;
    return { x: this.x, y: portY };
  }

  getOutputPortPosition(index) {
    const portY = this.y + 35 + index * 20;
    return { x: this.x + this.width, y: portY };
  }

  getInputPortAt(x, y) {
    for (let i = 0; i < this.inputs.length; i++) {
      const pos = this.getInputPortPosition(i);
      const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
      if (dist < 8) return i;
    }
    return null;
  }

  getOutputPortAt(x, y) {
    for (let i = 0; i < this.outputs.length; i++) {
      const pos = this.getOutputPortPosition(i);
      const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
      if (dist < 8) return i;
    }
    return null;
  }

  draw(ctx, isHovered = false) {
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(this.x, this.y, this.width, this.height);

    ctx.strokeStyle = '#4a90e2';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x, this.y, this.width, this.height);

    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(this.x, this.y, this.width, 25);

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.title, this.x + this.width / 2, this.y + 17);

    this.inputs.forEach((input, i) => {
      const portY = this.y + 35 + i * 20;
      ctx.fillStyle = '#4a90e2';
      ctx.beginPath();
      ctx.arc(this.x, portY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#cccccc';
      ctx.font = '11px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(input, this.x + 10, portY + 4);
    });

    this.outputs.forEach((output, i) => {
      const portY = this.y + 35 + i * 20;
      ctx.fillStyle = '#4a90e2';
      ctx.beginPath();
      ctx.arc(this.x + this.width, portY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#cccccc';
      ctx.font = '11px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(output, this.x + this.width - 10, portY + 4);
    });

    this.drawParameters(ctx, isHovered);
  }

  drawParameters(ctx, isHovered = false) {
    void ctx;
    void isHovered;
  }

  getKnobs() {
    return [];
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

  drawKnob(ctx, knob, isHovered) {
    const normalized = (knob.value - knob.min) / (knob.max - knob.min);
    const startAngle = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const valueAngle = startAngle + normalized * sweep;

    ctx.beginPath();
    ctx.arc(knob.x, knob.y, knob.radius, 0, Math.PI * 2);
    ctx.fillStyle = KNOB_STYLE.bodyFill;
    ctx.fill();
    ctx.strokeStyle = isHovered ? KNOB_STYLE.hoverStroke : KNOB_STYLE.stroke;
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(knob.x, knob.y, knob.radius + 3, startAngle, startAngle + sweep);
    ctx.strokeStyle = KNOB_STYLE.ringBackground;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(knob.x, knob.y, knob.radius + 3, startAngle, valueAngle);
    ctx.strokeStyle = KNOB_STYLE.ringValue;
    ctx.lineWidth = 2;
    ctx.stroke();

    const pointerLen = knob.radius - 4;
    ctx.beginPath();
    ctx.moveTo(knob.x, knob.y);
    ctx.lineTo(
      knob.x + Math.cos(valueAngle) * pointerLen,
      knob.y + Math.sin(valueAngle) * pointerLen
    );
    ctx.strokeStyle = KNOB_STYLE.pointer;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = KNOB_STYLE.labelColor;
    ctx.font = KNOB_STYLE.labelFont;
    ctx.textAlign = 'center';
    ctx.fillText(knob.label, knob.x, knob.y - knob.radius - 7);

    ctx.fillStyle = KNOB_STYLE.valueColor;
    ctx.font = KNOB_STYLE.valueFont;
    ctx.fillText(knob.valueText || knob.value.toFixed(2), knob.x, knob.y + knob.radius + 12);
  }
}
