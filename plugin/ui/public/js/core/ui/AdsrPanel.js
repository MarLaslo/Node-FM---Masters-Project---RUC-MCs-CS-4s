export class AdsrPanel {
  constructor(emitNodeParameterUpdate) {
    this.emitNodeParameterUpdate = emitNodeParameterUpdate;
  }

  render(controls, node) {
    const adsrSection = document.createElement('div');
    adsrSection.innerHTML = '<h3>ADSR Envelope</h3>';
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

    this.createKnobControl(knobGrid, 'Attack', 'attack', node.attack || 0.01, 0.001, 2, 3, node, redrawEnvelope);
    this.createKnobControl(knobGrid, 'Decay', 'decay', node.decay || 0.1, 0.001, 2, 3, node, redrawEnvelope);
    this.createKnobControl(knobGrid, 'Sustain', 'sustain', node.sustain || 0.7, 0, 1, 3, node, redrawEnvelope);
    this.createKnobControl(knobGrid, 'Release', 'release', node.release || 0.3, 0.001, 5, 3, node, redrawEnvelope);

    redrawEnvelope();
  }

  drawEnvelope(canvas, node) {
    const width = Math.max(75, canvas.clientWidth || 270);
    const height = Math.max(60, canvas.clientHeight || 90);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    const pad = 9;
    const graphWidth = width - pad * 2;
    const graphHeight = height - pad * 2;
    const baseY = pad + graphHeight;
    const topY = pad;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#181818';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad + (i / 4) * graphHeight;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(width - pad, y);
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

    const x = (t) => pad + (t / total) * graphWidth;
    const sustainY = baseY - sustain * graphHeight;
    const sustainLineY = sustain <= 0 ? baseY : sustainY;

    ctx.strokeStyle = '#6ab0f3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x(0), baseY);
    ctx.lineTo(x(attack), topY);
    ctx.lineTo(x(attack + decay), sustainLineY);
    ctx.lineTo(x(attack + decay + hold), sustainLineY);
    ctx.lineTo(x(total), baseY);
    ctx.stroke();

    if (sustain <= 0) {
      ctx.strokeStyle = '#3f6f9f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x(attack + decay), baseY);
      ctx.lineTo(x(attack + decay + hold), baseY);
      ctx.stroke();
    }

    ctx.fillStyle = '#8c8c8c';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`A ${attack.toFixed(3)}s`, x(attack) - 8, height - 2);
    ctx.fillText(`D ${decay.toFixed(3)}s`, x(attack + decay) - 8, height - 2);
    ctx.fillText(`S ${(sustain * 100).toFixed(0)}%`, x(attack + decay + hold) - 8, height - 2);
    ctx.fillText(`R ${release.toFixed(3)}s`, x(total) - 8, height - 2);

    ctx.fillStyle = '#bdbdbd';
    ctx.font = '7px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(
      `Attack ${attack.toFixed(3)}s  Decay ${decay.toFixed(3)}s  Sustain ${(sustain * 100).toFixed(0)}%  Release ${release.toFixed(3)}s`,
      width - pad,
      9
    );
  }

  createKnobControl(container, label, paramName, value, min, max, precision, node, onChange) {
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

    const commitValue = (newValue) => {
      currentValue = toNumber(newValue);
      node[paramName] = currentValue;
      valueElem.textContent = currentValue.toFixed(precision);
      knob.style.setProperty('--knob-angle', `${normalizedAngle(currentValue)}deg`);
      this.emitNodeParameterUpdate(node, paramName, currentValue);
      if (typeof onChange === 'function') {
        onChange();
      }
    };

    commitValue(currentValue);

    knob.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const startY = event.clientY;
      const startValue = currentValue;
      const range = max - min;
      const sensitivity = paramName === 'sustain' ? 180 : 260;

      const handleMove = (moveEvent) => {
        const deltaY = startY - moveEvent.clientY;
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