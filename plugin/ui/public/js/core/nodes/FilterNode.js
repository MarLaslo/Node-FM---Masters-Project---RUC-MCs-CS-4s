import { Node } from './Node.js';

export class FilterNode extends Node {
  constructor(x, y) {
    super('Filter', x, y);
    this.inputs = ['Audio In'];
    this.outputs = ['Audio Out'];
    this.width = 224;

    this.cutoff = 1200;
    this.resonance = 0.707;
    this.envAmount = 2000;
    this.filterType = 0; // 0=LP, 1=BP, 2=HP
    this.filterCurve = 0; // 0=12 dB, 1=24 dB

    this.attack = 0.01;
    this.decay = 0.1;
    this.sustain = 0.7;
    this.release = 0.3;

    this.adsrExpanded = false;
    this.baseHeight = 164;
    this.expandedHeight = 310;
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

  drawRoundedRect(ctx, px, py, pw, ph, r) {
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
  }

  getModeBadgeBounds() {
    return {
      x: this.x + 12,
      y: this.y + 58,
      w: 64,
      h: 20
    };
  }

  getCurveBadgeBounds() {
    return {
      x: this.x + this.width - 78,
      y: this.y + 58,
      w: 66,
      h: 20
    };
  }

  getKnobs() {
    const knobY = this.y + 120;
    const knobs = [
      {
        paramName: 'cutoff',
        label: 'Cutoff',
        value: this.cutoff,
        min: 20,
        max: 20000,
        sensitivity: 460,
        x: this.x + 52,
        y: knobY,
        radius: 10,
        valueText: `${Math.round(this.cutoff)} Hz`
      },
      {
        paramName: 'resonance',
        label: 'Q',
        value: this.resonance,
        min: 0.1,
        max: 20,
        sensitivity: 200,
        x: this.x + 112,
        y: knobY,
        radius: 10,
        valueText: this.resonance.toFixed(2)
      },
      {
        paramName: 'envAmount',
        label: 'Env',
        value: this.envAmount,
        min: -10000,
        max: 10000,
        sensitivity: 420,
        x: this.x + 172,
        y: knobY,
        radius: 10,
        valueText: `${Math.round(this.envAmount)} Hz`
      }
    ];

    if (!this.adsrExpanded) {
      return knobs;
    }

    const adsrKnobY = this.y + 286;
    return knobs.concat([
      {
        paramName: 'attack',
        label: 'A',
        value: this.attack,
        min: 0.001,
        max: 2,
        sensitivity: 260,
        x: this.x + 52,
        y: adsrKnobY,
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
        y: adsrKnobY,
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
        y: adsrKnobY,
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
        y: adsrKnobY,
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
    const y = this.y + 172;
    const padX = 10;
    const padTop = 12;
    const padBottom = 16;
    const graphWidth = width - padX * 2;
    const graphHeight = height - padTop - padBottom;
    const baseY = y + padTop + graphHeight;
    const topY = y + padTop;

    ctx.fillStyle = '#1e0f15';
    ctx.fillRect(x, y, width, height);

    ctx.strokeStyle = '#5e3340';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    ctx.strokeStyle = '#3a1d27';
    for (let i = 0; i <= 4; i++) {
      const gy = y + padTop + (i / 4) * graphHeight;
      ctx.beginPath();
      ctx.moveTo(x + padX, gy);
      ctx.lineTo(x + width - padX, gy);
      ctx.stroke();
    }

    ctx.strokeStyle = '#2f1720';
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
    gradient.addColorStop(0, '#ffd7e3');
    gradient.addColorStop(1, '#f19ab2');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(tx(0), baseY);
    ctx.lineTo(tx(attack), topY);
    ctx.lineTo(tx(attack + decay), sustainY);
    ctx.lineTo(tx(attack + decay + hold), sustainY);
    ctx.lineTo(tx(total), baseY);
    ctx.stroke();

    ctx.fillStyle = '#efc9d4';
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

    const bodyGradient = ctx.createLinearGradient(x, y, x + w, y + h);
    bodyGradient.addColorStop(0, '#3a1c24');
    bodyGradient.addColorStop(1, '#261219');
    this.drawRoundedRect(ctx, x, y, w, h, 12);
    ctx.fillStyle = bodyGradient;
    ctx.fill();

    this.drawRoundedRect(ctx, x, y, w, h, 12);
    ctx.strokeStyle = '#d86c82';
    ctx.lineWidth = 2;
    ctx.stroke();

    const headerGradient = ctx.createLinearGradient(x, y, x + w, y + 28);
    headerGradient.addColorStop(0, '#6a2f3c');
    headerGradient.addColorStop(1, '#4d2430');
    this.drawRoundedRect(ctx, x + 1, y + 1, w - 2, 27, 10);
    ctx.fillStyle = headerGradient;
    ctx.fill();

    ctx.fillStyle = '#ffe9ee';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.title, x + w * 0.5, y + 18);

    const toggle = this.getAdsrToggleBounds();
    this.drawRoundedRect(ctx, toggle.x, toggle.y, toggle.w, toggle.h, 3);
    ctx.fillStyle = this.adsrExpanded ? '#7b3a4c' : '#663243';
    ctx.fill();
    this.drawRoundedRect(ctx, toggle.x, toggle.y, toggle.w, toggle.h, 3);
    ctx.strokeStyle = this.adsrExpanded ? '#f2b9c8' : '#d58ba0';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#ffeaf1';
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

    this.inputs.forEach((input, i) => {
      const portY = y + 40 + i * 20;
      ctx.fillStyle = '#e78da0';
      ctx.beginPath();
      ctx.arc(x, portY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f0c8d2';
      ctx.font = '10px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(input, x + 10, portY + 4);
    });

    this.outputs.forEach((output, i) => {
      const portY = y + 40 + i * 20;
      ctx.fillStyle = '#e78da0';
      ctx.beginPath();
      ctx.arc(x + w, portY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f0c8d2';
      ctx.font = '10px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(output, x + w - 10, portY + 4);
    });

    this.drawParameters(ctx, hoveredKnobName);
  }

  drawParameters(ctx, hoveredKnobName = null) {
    const isAdsrParam = (paramName) => (
      paramName === 'attack'
      || paramName === 'decay'
      || paramName === 'sustain'
      || paramName === 'release'
    );

    this.drawRoundedRect(ctx, this.x + 6, this.y + 84, this.width - 12, 74, 8);
    ctx.fillStyle = '#1f1116';
    ctx.fill();

    const knobs = this.getKnobs();
    for (const knob of knobs) {
      if (!isAdsrParam(knob.paramName)) {
        this.drawKnob(ctx, knob, hoveredKnobName === knob.paramName);
      }
    }

    const modeLabel = this.filterType <= 0.5 ? 'LP' : (this.filterType <= 1.5 ? 'BP' : 'HP');
    const curveLabel = this.filterCurve <= 0.5 ? '12dB' : '24dB';

    const modeBadge = this.getModeBadgeBounds();
    this.drawRoundedRect(ctx, modeBadge.x, modeBadge.y, modeBadge.w, modeBadge.h, 5);
    ctx.fillStyle = '#7a3344';
    ctx.fill();
    this.drawRoundedRect(ctx, modeBadge.x, modeBadge.y, modeBadge.w, modeBadge.h, 5);
    ctx.strokeStyle = '#d97790';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffe5ec';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(modeLabel, modeBadge.x + modeBadge.w * 0.5, modeBadge.y + 13);

    const curveBadge = this.getCurveBadgeBounds();
    this.drawRoundedRect(ctx, curveBadge.x, curveBadge.y, curveBadge.w, curveBadge.h, 5);
    ctx.fillStyle = '#66323f';
    ctx.fill();
    this.drawRoundedRect(ctx, curveBadge.x, curveBadge.y, curveBadge.w, curveBadge.h, 5);
    ctx.strokeStyle = '#cb7387';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffe7ee';
    ctx.fillText(curveLabel, curveBadge.x + curveBadge.w * 0.5, curveBadge.y + 13);

    if (!this.adsrExpanded) {
      return;
    }

    ctx.fillStyle = '#f2ced9';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ENVELOPE', this.x + 12, this.y + 168);

    this.drawEnvelope(ctx);

    ctx.fillStyle = '#2a141c';
    ctx.fillRect(this.x + 12, this.y + 266, this.width - 24, 34);
    ctx.strokeStyle = '#673746';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x + 12, this.y + 266, this.width - 24, 34);

    for (const knob of knobs) {
      if (isAdsrParam(knob.paramName)) {
        this.drawKnob(ctx, knob, hoveredKnobName === knob.paramName);
      }
    }
  }

  onParameterClick(x, y, graph) {
    const toggle = this.getAdsrToggleBounds();
    const inToggle = x >= toggle.x && x <= toggle.x + toggle.w && y >= toggle.y && y <= toggle.y + toggle.h;
    if (inToggle) {
      this.setAdsrExpanded(!this.adsrExpanded);
      if (graph && typeof graph.setFilterAdsrExpanded === 'function') {
        graph.setFilterAdsrExpanded(this, this.adsrExpanded);
      }
      return true;
    }

    const inRect = (rect) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

    const modeBadge = this.getModeBadgeBounds();
    if (inRect(modeBadge)) {
      this.filterType = (Math.round(this.filterType) + 1) % 3;
      if (graph && typeof graph.emitNodeParameterUpdate === 'function') {
        graph.emitNodeParameterUpdate(this, 'filterType', this.filterType);
      }
      return true;
    }

    const curveBadge = this.getCurveBadgeBounds();
    if (inRect(curveBadge)) {
      this.filterCurve = this.filterCurve <= 0.5 ? 1 : 0;
      if (graph && typeof graph.emitNodeParameterUpdate === 'function') {
        graph.emitNodeParameterUpdate(this, 'filterCurve', this.filterCurve);
      }
      return true;
    }

    return super.onParameterClick(x, y, graph);
  }
}
