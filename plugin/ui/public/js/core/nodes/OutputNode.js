import { Node } from './Node.js';

export class OutputNode extends Node {
  constructor(x, y) {
    super('Output', x, y);
    this.inputs = ['Audio'];
    this.height = 98;
    this.spectrum = new Array(32).fill(0);
    this.outGain = 0.5;
  }

  setSpectrum(values) {
    if (!Array.isArray(values)) {
      return;
    }

    const count = Math.min(this.spectrum.length, values.length);
    for (let i = 0; i < count; i++) {
      const incoming = Number(values[i]);
      if (!Number.isFinite(incoming)) {
        continue;
      }

      const clamped = Math.max(0, Math.min(1, incoming));
      this.spectrum[i] = this.spectrum[i] * 0.62 + clamped * 0.38;
    }
  }

    getKnobs() {
    const knobY = this.y + 68;
    return [
      {
        paramName: 'outGain',
        label: 'Out Gain',
        value: this.outGain,
        min: 0,
        max: 1,
        sensitivity: 140,
        x: this.x + 48,
        y: knobY,
        radius: 12,
        valueText: this.outGain.toFixed(3)
      }
    ];
  }

  drawParameters(ctx) {
    const padX = 8;
    const top = this.y + 45;
    const width = this.width - padX * 2;
    const height = this.height - 53;

    ctx.fillStyle = '#111823';
    ctx.fillRect(this.x + padX, top, width, height);
    ctx.strokeStyle = '#2f435f';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x + padX, top, width, height);

    const barCount = this.spectrum.length;
    const gap = 1;
    const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);
    

    for (let i = 0; i < barCount; i++) {
      const strength = Math.max(0, Math.min(1, this.spectrum[i]));
      const barHeight = Math.max(1, strength * (height - 2));
      const x = this.x + padX + i * (barWidth + gap);
      const y = top + height - 1 - barHeight;

      const green = Math.round(140 + strength * 90);
      const blue = Math.round(180 + strength * 60);
      ctx.fillStyle = `rgb(96, ${green}, ${blue})`;
      ctx.fillRect(x, y, barWidth, barHeight);
    }

    ctx.fillStyle = '#8aa3c3';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Spectrum', this.x + padX + 2, top + 9);
  }
}
