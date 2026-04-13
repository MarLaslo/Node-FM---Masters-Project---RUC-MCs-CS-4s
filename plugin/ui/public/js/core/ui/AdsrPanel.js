export class AdsrPanel {
  constructor(emitNodeParameterUpdate) {
    this.emitNodeParameterUpdate = emitNodeParameterUpdate;
  }

  render(controls, node) {
    const adsrSection = document.createElement('section');
    adsrSection.className = 'adsr-section';
    adsrSection.innerHTML = '<h3>ADSR Envelope</h3><div class="adsr-meta">Drag knob up/down to adjust</div>';
    controls.appendChild(adsrSection);

    const envelopeWrap = document.createElement('div');
    envelopeWrap.className = 'adsr-envelope-wrap';
    const envelopeCanvas = document.createElement('canvas');
    envelopeCanvas.className = 'adsr-envelope';
    envelopeWrap.appendChild(envelopeCanvas);
    controls.appendChild(envelopeWrap);

    const knobGrid = document.createElement('div');
    knobGrid.className = 'adsr-knob-grid';
    controls.appendChild(knobGrid);

    const redrawEnvelope = () => {
      this.drawEnvelope(envelopeCanvas, node);
    };

    const attackValue = Number.isFinite(node.attack) ? node.attack : 0.01;
    const decayValue = Number.isFinite(node.decay) ? node.decay : 0.1;
    const sustainValue = Number.isFinite(node.sustain) ? node.sustain : 0.7;
    const releaseValue = Number.isFinite(node.release) ? node.release : 0.3;

    this.createKnobControl(knobGrid, 'Attack', 'attack', attackValue, 0.001, 2, node, redrawEnvelope);
    this.createKnobControl(knobGrid, 'Decay', 'decay', decayValue, 0.001, 2, node, redrawEnvelope);
    this.createKnobControl(knobGrid, 'Sustain', 'sustain', sustainValue, 0, 1, node, redrawEnvelope);
    this.createKnobControl(knobGrid, 'Release', 'release', releaseValue, 0.001, 5, node, redrawEnvelope);

    redrawEnvelope();
    requestAnimationFrame(redrawEnvelope);
  }

  formatValue(value, paramName) {
    if (paramName === 'sustain') {
      return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(0)}%`;
    }

    if (value < 1) {
      return `${(value * 1000).toFixed(0)}ms`;
    }

    return `${value.toFixed(2)}s`;
  }

  drawEnvelope(canvas, node) {
    const cssWidth = Math.max(220, canvas.clientWidth || 320);
    const cssHeight = Math.max(72, canvas.clientHeight || 92);
    const dpr = window.devicePixelRatio || 1;
    const renderWidth = Math.floor(cssWidth * dpr);
    const renderHeight = Math.floor(cssHeight * dpr);

    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
      canvas.width = renderWidth;
      canvas.height = renderHeight;
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = cssWidth;
    const height = cssHeight;
    const padX = 10;
    const padTop = 11;
    const padBottom = 14;
    const graphWidth = width - padX * 2;
    const graphHeight = height - padTop - padBottom;
    const baseY = padTop + graphHeight;
    const topY = padTop;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#121720';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#233044';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padTop + (i / 4) * graphHeight;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(width - padX, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#1b2738';
    for (let i = 0; i <= 6; i++) {
      const xGrid = padX + (i / 6) * graphWidth;
      ctx.beginPath();
      ctx.moveTo(xGrid, padTop);
      ctx.lineTo(xGrid, baseY);
      ctx.stroke();
    }

    const attack = Math.max(0.001, node.attack || 0.01);
    const decay = Math.max(0.001, node.decay || 0.1);
    const release = Math.max(0.001, node.release || 0.3);
    const sustainRaw = Number.isFinite(node.sustain) ? node.sustain : 0.7;
    const sustain = Math.max(0, Math.min(1, sustainRaw));
    const phaseTotal = attack + decay + release;
    const hold = Math.max(0.15, phaseTotal * 0.5);
    const total = phaseTotal + hold;

    const x = (t) => padX + (t / total) * graphWidth;
    const sustainY = baseY - sustain * graphHeight;
    const sustainLineY = sustain <= 0 ? baseY : sustainY;

    const gradient = ctx.createLinearGradient(0, topY, 0, baseY);
    gradient.addColorStop(0, '#9fe1ff');
    gradient.addColorStop(1, '#56b2ff');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x(0), baseY);
    ctx.lineTo(x(attack), topY);
    ctx.lineTo(x(attack + decay), sustainLineY);
    ctx.lineTo(x(attack + decay + hold), sustainLineY);
    ctx.lineTo(x(total), baseY);
    ctx.stroke();

    if (sustain <= 0) {
      ctx.strokeStyle = '#3e77a9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x(attack + decay), baseY);
      ctx.lineTo(x(attack + decay + hold), baseY);
      ctx.stroke();
    }

    ctx.fillStyle = '#8da2be';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`A ${this.formatValue(attack, 'attack')}`, x(attack) - 10, height - 2);
    ctx.fillText(`D ${this.formatValue(decay, 'decay')}`, x(attack + decay) - 10, height - 2);
    ctx.fillText(`S ${this.formatValue(sustain, 'sustain')}`, x(attack + decay + hold) - 10, height - 2);
    ctx.fillText(`R ${this.formatValue(release, 'release')}`, x(total) - 10, height - 2);

    ctx.fillStyle = '#c4cfdd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(
      `A ${this.formatValue(attack, 'attack')}  D ${this.formatValue(decay, 'decay')}  S ${this.formatValue(sustain, 'sustain')}  R ${this.formatValue(release, 'release')}`,
      width - padX,
      10
    );
  }

  createKnobControl(container, label, paramName, value, min, max, node, onChange) {
    const control = document.createElement('div');
    control.className = 'adsr-knob-control';

    const knob = document.createElement('div');
    knob.className = 'adsr-knob';
    const indicator = document.createElement('div');
    indicator.className = 'adsr-knob-indicator';
    knob.appendChild(indicator);

    const labelElem = document.createElement('div');
    labelElem.className = 'adsr-knob-label';
    labelElem.textContent = label;

    const valueElem = document.createElement('div');
    valueElem.className = 'adsr-knob-value';

    let currentValue = value;
    const toNumber = (v) => Math.max(min, Math.min(max, v));
    const normalizedAngle = (v) => {
      const normalized = (v - min) / (max - min);
      return -135 + normalized * 270;
    };

    const commitValue = (newValue, emitUpdate = true) => {
      currentValue = toNumber(newValue);
      node[paramName] = currentValue;
      valueElem.textContent = this.formatValue(currentValue, paramName);
      knob.style.setProperty('--knob-angle', `${normalizedAngle(currentValue)}deg`);
      if (emitUpdate) {
        this.emitNodeParameterUpdate(node, paramName, currentValue);
      }
      if (typeof onChange === 'function') {
        onChange();
      }
    };

    commitValue(currentValue, false);

    knob.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const startY = event.clientY;
      const startValue = currentValue;
      const range = max - min;

      const handleMove = (moveEvent) => {
        const deltaY = startY - moveEvent.clientY;
        const sensitivity = (paramName === 'sustain' ? 180 : 260) * (moveEvent.shiftKey ? 4 : 1);
        const nextValue = startValue + (deltaY / sensitivity) * range;
        commitValue(nextValue);
      };

      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
      };

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    });

    control.appendChild(knob);
    control.appendChild(labelElem);
    control.appendChild(valueElem);
    container.appendChild(control);
  }
}
