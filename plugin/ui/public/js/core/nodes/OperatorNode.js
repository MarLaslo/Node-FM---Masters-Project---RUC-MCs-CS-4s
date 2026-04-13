import { Node } from './Node.js';

export class OperatorNode extends Node {
  constructor(x, y) {
    super('Operator', x, y);
    this.inputs = ['FM In'];
    this.outputs = ['Audio'];
    this.width = 224;
    this.frequencyRatio = 1.0;
    this.ratio = 1.0;
    this.amplitude = 0.5;
    this.velocityAmount = 1.0;

    this.attack = 0.01;
    this.decay = 0.1;
    this.sustain = 0.7;
    this.release = 0.3;

    this.adsrExpanded = false;
    this.baseHeight = 112;
    this.expandedHeight = 258;
    this.height = this.baseHeight;
  }

  setAdsrExpanded(expanded) {
    this.adsrExpanded = !!expanded;
    this.height = this.adsrExpanded ? this.expandedHeight : this.baseHeight;
  }

  getAdsrToggleBounds() {
    return {
      x: this.x + this.width - 24,
      y: this.y + 7,
      w: 14,
      h: 14
    };
  }

  getMainKnobY() {
    return this.y + 82;
  }

  getAdsrKnobY() {
    return this.y + 234;
  }

  getKnobs() {
    const knobs = [
      {
        paramName: 'frequencyRatio',
        label: 'Ratio',
        value: this.frequencyRatio,
        min: 0.125,
        max: 8,
        sensitivity: 140,
        x: this.x + 52,
        y: this.getMainKnobY(),
        radius: 10,
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
        y: this.getMainKnobY(),
        radius: 10,
        valueText: this.amplitude.toFixed(3)
      },
      {
        paramName: 'velocityAmount',
        label: 'Vel',
        value: this.velocityAmount,
        min: 0,
        max: 1,
        sensitivity: 140,
        x: this.x + 172,
        y: this.getMainKnobY(),
        radius: 10,
        valueText: this.velocityAmount.toFixed(3)
      }
    ];

    if (!this.adsrExpanded) {
      return knobs;
    }

    return knobs.concat([
      {
        paramName: 'attack',
        label: 'A',
        value: this.attack,
        min: 0.001,
        max: 2,
        sensitivity: 260,
        x: this.x + 52,
        y: this.getAdsrKnobY(),
        radius: 10,
        valueText: this.formatAdsrValue(this.attack, 'attack')
      },
      {
        paramName: 'decay',
        label: 'D',
        value: this.decay,
        min: 0.001,
        max: 2,
        sensitivity: 260,
        x: this.x + 92,
        y: this.getAdsrKnobY(),
        radius: 10,
        valueText: this.formatAdsrValue(this.decay, 'decay')
      },
      {
        paramName: 'sustain',
        label: 'S',
        value: this.sustain,
        min: 0,
        max: 1,
        sensitivity: 180,
        x: this.x + 132,
        y: this.getAdsrKnobY(),
        radius: 10,
        valueText: this.formatAdsrValue(this.sustain, 'sustain')
      },
      {
        paramName: 'release',
        label: 'R',
        value: this.release,
        min: 0.001,
        max: 5,
        sensitivity: 300,
        x: this.x + 172,
        y: this.getAdsrKnobY(),
        radius: 10,
        valueText: this.formatAdsrValue(this.release, 'release')
      }
    ]);
  }

  formatAdsrValue(value, paramName) {
    if (paramName === 'sustain') {
      const normalized = Math.max(0, Math.min(1, value));
      return `${(normalized * 100).toFixed(0)}%`;
    }

    if (value < 1) {
      return `${(value * 1000).toFixed(0)}ms`;
    }

    return `${value.toFixed(2)}s`;
  }

  drawEnvelope(ctx) {
    const width = this.width - 24;
    const height = 90;
    const x = this.x + 12;
    const y = this.y + 120;
    const padX = 10;
    const padTop = 12;
    const padBottom = 16;
    const graphWidth = width - padX * 2;
    const graphHeight = height - padTop - padBottom;
    const baseY = y + padTop + graphHeight;
    const topY = y + padTop;

    ctx.fillStyle = '#121720';
    ctx.fillRect(x, y, width, height);

    ctx.strokeStyle = '#2f3f56';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    ctx.strokeStyle = '#233044';
    for (let i = 0; i <= 4; i++) {
      const gy = y + padTop + (i / 4) * graphHeight;
      ctx.beginPath();
      ctx.moveTo(x + padX, gy);
      ctx.lineTo(x + width - padX, gy);
      ctx.stroke();
    }

    ctx.strokeStyle = '#1b2738';
    for (let i = 0; i <= 6; i++) {
      const gx = x + padX + (i / 6) * graphWidth;
      ctx.beginPath();
      ctx.moveTo(gx, y + padTop);
      ctx.lineTo(gx, baseY);
      ctx.stroke();
    }

    const attack = Math.max(0.001, this.attack || 0.01);
    const decay = Math.max(0.001, this.decay || 0.1);
    const release = Math.max(0.001, this.release || 0.3);
    const sustain = Math.max(0, Math.min(1, Number.isFinite(this.sustain) ? this.sustain : 0.7));
    const phaseTotal = attack + decay + release;
    const hold = Math.max(0.15, phaseTotal * 0.5);
    const total = phaseTotal + hold;

    const tx = (t) => x + padX + (t / total) * graphWidth;
    const sustainY = baseY - sustain * graphHeight;

    const gradient = ctx.createLinearGradient(0, topY, 0, baseY);
    gradient.addColorStop(0, '#9fe1ff');
    gradient.addColorStop(1, '#56b2ff');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(tx(0), baseY);
    ctx.lineTo(tx(attack), topY);
    ctx.lineTo(tx(attack + decay), sustainY);
    ctx.lineTo(tx(attack + decay + hold), sustainY);
    ctx.lineTo(tx(total), baseY);
    ctx.stroke();

    ctx.fillStyle = '#8da2be';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`A ${this.formatAdsrValue(attack, 'attack')}`, tx(attack) - 8, y + height - 3);
    ctx.fillText(`D ${this.formatAdsrValue(decay, 'decay')}`, tx(attack + decay) - 8, y + height - 3);
    ctx.fillText(`S ${this.formatAdsrValue(sustain, 'sustain')}`, tx(attack + decay + hold) - 8, y + height - 3);
    ctx.fillText(`R ${this.formatAdsrValue(release, 'release')}`, tx(total) - 8, y + height - 3);
  }

  draw(ctx, hoveredKnobName = null) {
    const x = this.x;
    const y = this.y;
    const w = this.width;
    const h = this.height;

    const drawRoundedRect = (px, py, pw, ph, r) => {
      const radius = Math.min(r, pw * 0.5, ph * 0.5);
      ctx.beginPath();
      ctx.moveTo(px + radius, py);
      ctx.lineTo(px + pw - radius, py);
      ctx.quadraticCurveTo(px + pw, py, px + pw, py + radius);
      ctx.lineTo(px + pw, py + ph - radius);
      ctx.quadraticCurveTo(px + pw, py + ph, px + pw - radius, py + ph);
      ctx.lineTo(px + radius, py + ph);
      ctx.quadraticCurveTo(px, py + ph, px, py + ph - radius);
      ctx.lineTo(px, py + radius);
      ctx.quadraticCurveTo(px, py, px + radius, py);
      ctx.closePath();
    };

    const bodyGradient = ctx.createLinearGradient(x, y, x + w, y + h);
    bodyGradient.addColorStop(0, '#1e2430');
    bodyGradient.addColorStop(1, '#151b25');
    drawRoundedRect(x, y, w, h, 8);
    ctx.fillStyle = bodyGradient;
    ctx.fill();

    drawRoundedRect(x, y, w, h, 8);
    ctx.strokeStyle = '#5fb1ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    const headerGradient = ctx.createLinearGradient(x, y, x + w, y + 28);
    headerGradient.addColorStop(0, '#2d415a');
    headerGradient.addColorStop(1, '#203247');
    drawRoundedRect(x + 1, y + 1, w - 2, 26, 7);
    ctx.fillStyle = headerGradient;
    ctx.fill();

    ctx.fillStyle = '#e8f3ff';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.title, x + w * 0.5, y + 18);

    this.inputs.forEach((input, i) => {
      const portY = y + 35 + i * 20;
      ctx.fillStyle = '#6ab8ff';
      ctx.beginPath();
      ctx.arc(x, portY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#b9c9de';
      ctx.font = '11px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(input, x + 10, portY + 4);
    });

    this.outputs.forEach((output, i) => {
      const portY = y + 35 + i * 20;
      ctx.fillStyle = '#6ab8ff';
      ctx.beginPath();
      ctx.arc(x + w, portY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#b9c9de';
      ctx.font = '11px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(output, x + w - 10, portY + 4);
    });

    const toggle = this.getAdsrToggleBounds();
    drawRoundedRect(toggle.x, toggle.y, toggle.w, toggle.h, 3);
    ctx.fillStyle = this.adsrExpanded ? '#2f4a66' : '#25374c';
    ctx.fill();
    drawRoundedRect(toggle.x, toggle.y, toggle.w, toggle.h, 3);
    ctx.strokeStyle = this.adsrExpanded ? '#84b8ec' : '#5f88b5';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#e7f3ff';
    ctx.beginPath();
    if (this.adsrExpanded) {
      ctx.moveTo(toggle.x + 3, toggle.y + 9);
      ctx.lineTo(toggle.x + 7, toggle.y + 5);
      ctx.lineTo(toggle.x + 11, toggle.y + 9);
    } else {
      ctx.moveTo(toggle.x + 5, toggle.y + 3);
      ctx.lineTo(toggle.x + 9, toggle.y + 7);
      ctx.lineTo(toggle.x + 5, toggle.y + 11);
    }
    ctx.closePath();
    ctx.fill();

    this.drawParameters(ctx, hoveredKnobName);
  }

  drawParameters(ctx, hoveredKnobName = null) {
    const isAdsrParam = (paramName) => (
      paramName === 'attack'
      || paramName === 'decay'
      || paramName === 'sustain'
      || paramName === 'release'
    );

    ctx.fillStyle = '#111a25';
    ctx.fillRect(this.x + 6, this.y + 58, this.width - 12, 50);

    const knobs = this.getKnobs();
    for (const knob of knobs) {
      if (!isAdsrParam(knob.paramName)) {
        this.drawKnob(ctx, knob, hoveredKnobName === knob.paramName);
      }
    }

    if (!this.adsrExpanded) {
      return;
    }

    ctx.fillStyle = '#8ca5c4';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ENVELOPE', this.x + 12, this.y + 116);

    this.drawEnvelope(ctx);

    ctx.fillStyle = '#1a2230';
    ctx.fillRect(this.x + 12, this.y + 214, this.width - 24, 34);
    ctx.strokeStyle = '#32475f';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x + 12, this.y + 214, this.width - 24, 34);

    for (const knob of knobs) {
      if (isAdsrParam(knob.paramName)) {
        this.drawKnob(ctx, knob, hoveredKnobName === knob.paramName);
      }
    }
  }

  onParameterClick(x, y, graph, event = null) {
    const toggle = this.getAdsrToggleBounds();
    const inToggle = x >= toggle.x && x <= toggle.x + toggle.w && y >= toggle.y && y <= toggle.y + toggle.h;
    if (inToggle) {
      this.setAdsrExpanded(!this.adsrExpanded);
      if (graph && typeof graph.setOperatorAdsrExpanded === 'function') {
        graph.setOperatorAdsrExpanded(this, this.adsrExpanded);
      }
      return true;
    }

    return super.onParameterClick(x, y, graph, event);
  }
}
