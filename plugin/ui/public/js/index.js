import * as Juce from "./juce/index.js";

console.log("NodeFM Frontend initializing...");

// Simple Node Graph System with Connections
class NodeGraph {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = [];
    this.connections = [];
    this.selectedNode = null;
    this.dragOffset = { x: 0, y: 0 };
    this.isDragging = false;
    this.isAdjustingKnob = false;
    this.adjustingKnob = null;
    this.isConnecting = false;
    this.connectionStart = null;
    this.selectedConnection = null;
    this.mousePos = { x: 0, y: 0 };
    this.hoveredParamNode = null; // Track which node's params are hovered
    this.hoveredKnob = null;
    
    this.setupCanvas();
    this.setupEventListeners();
    this.startRenderLoop();
  }
  
  setupCanvas() {
    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight - 50; // Account for toolbar
    };
    resize();
    window.addEventListener('resize', resize);
  }
  
  setupEventListeners() {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
  }
  
  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }
  
  onMouseDown(e) {
    const pos = this.getMousePos(e);
    
    // Check if clicking on an output port
    for (let node of this.nodes) {
      const port = node.getOutputPortAt(pos.x, pos.y);
      if (port !== null) {
        this.isConnecting = true;
        this.connectionStart = { node, portIndex: port };
        return;
      }
    }
    
    // Check if clicking on a connection
    for (let i = this.connections.length - 1; i >= 0; i--) {
      const conn = this.connections[i];
      if (this.isPointNearConnection(pos, conn)) {
        this.selectedConnection = conn;
        this.showConnectionPanel(conn);
        return;
      }
    }
    
    // Check if clicking on a node
    let nodeClicked = false;
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      if (pos.x >= node.x && pos.x <= node.x + node.width &&
          pos.y >= node.y && pos.y <= node.y + node.height) {
        
        // Check if clicking on a parameter area for nodes that support it
        if (typeof node.onParameterClick === 'function') {
          const handled = node.onParameterClick(pos.x, pos.y, this);
          if (handled) return; // Don't drag if parameter was clicked
        }
        
        // Normal node selection and dragging
        this.selectedNode = node;
        this.isDragging = true;
        this.dragOffset = { x: pos.x - node.x, y: pos.y - node.y };
        nodeClicked = true;
        this.selectedConnection = null;
        
        // Show parameter panel for this node
        this.showParameterPanel(node);
        break;
      }
    }
    
    // If clicked on canvas (not node or connection), hide parameter panel
    if (!nodeClicked && !this.selectedConnection) {
      this.hideParameterPanel();
      this.selectedConnection = null;
    }
  }
  
  isPointNearConnection(point, conn) {
    const start = conn.fromNode.getOutputPortPosition(conn.fromPort);
    const end = conn.toNode.getInputPortPosition(conn.toPort);
    
    // Simple distance check to line segment
    const threshold = 10;
    const dist = this.distanceToLineSegment(point, start, end);
    return dist < threshold;
  }
  
  distanceToLineSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    
    if (lengthSquared === 0) return Math.sqrt((point.x - start.x) ** 2 + (point.y - start.y) ** 2);
    
    let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    
    const projX = start.x + t * dx;
    const projY = start.y + t * dy;
    
    return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
  }
  
  onMouseMove(e) {
    const pos = this.getMousePos(e);
    this.mousePos = pos;

    if (this.isAdjustingKnob && this.adjustingKnob) {
      this.updateKnobAdjustment(pos.y);
      return;
    }
    
    // Update cursor and hover state based on what's under the mouse
    let cursorStyle = 'default';
    this.hoveredParamNode = null;
    
    // Check if hovering over an operator knob
    for (let node of this.nodes) {
      if (node instanceof OperatorNode) {
        const knob = node.getKnobAt(pos.x, pos.y);
        if (knob) {
          cursorStyle = 'pointer';
          this.hoveredParamNode = node;
          this.hoveredKnob = { node, paramName: knob.paramName };
          break;
        }
      }
    }
    
    this.canvas.style.cursor = cursorStyle;
    
    if (this.isDragging && this.selectedNode) {
      this.selectedNode.x = pos.x - this.dragOffset.x;
      this.selectedNode.y = pos.y - this.dragOffset.y;
    }
  }
  
  onMouseUp(e) {
    if (this.isAdjustingKnob) {
      this.isAdjustingKnob = false;
      this.adjustingKnob = null;
      return;
    }

    if (this.isConnecting) {
      const pos = this.getMousePos(e);
      
      // Check if released on an input port
      for (let node of this.nodes) {
        const port = node.getInputPortAt(pos.x, pos.y);
        if (port !== null && node !== this.connectionStart.node) {
          this.addConnection(this.connectionStart.node, this.connectionStart.portIndex, node, port);
          break;
        }
      }
      
      this.isConnecting = false;
      this.connectionStart = null;
    }
    
    this.isDragging = false;
  }
  
  addConnection(fromNode, fromPort, toNode, toPort) {
    const connection = { 
      fromNode, 
      fromPort, 
      toNode, 
      toPort, 
      amount: 1.0  // Default modulation index
    };
    this.connections.push(connection);
    
    // Send connection to backend
    if (window.__JUCE__ && window.__JUCE__.backend) {
      const message = JSON.stringify({
        type: "ADD_CONNECTION",
        data: {
          sourceNodeId: fromNode.backendId,
          destNodeId: toNode.backendId,
          amount: connection.amount
        }
      });
      window.__JUCE__.backend.emitEvent("messageFromJS", message);
    }
  }
  
  addNode(node) {
    this.nodes.push(node);
  }

  findNodeByBackendId(backendId) {
    return this.nodes.find(node => node.backendId === backendId) || null;
  }

  addConnectionFromBackend(sourceNodeId, destNodeId, amount) {
    const fromNode = this.findNodeByBackendId(sourceNodeId);
    const toNode = this.findNodeByBackendId(destNodeId);

    if (!fromNode || !toNode) {
      return false;
    }

    this.connections.push({
      fromNode,
      fromPort: 0,
      toNode,
      toPort: 0,
      amount
    });

    return true;
  }

  beginKnobAdjustment(node, knob, mouseY) {
    this.isAdjustingKnob = true;
    this.adjustingKnob = {
      node,
      paramName: knob.paramName,
      min: knob.min,
      max: knob.max,
      sensitivity: knob.sensitivity,
      startY: mouseY,
      startValue: node[knob.paramName]
    };
  }

  updateKnobAdjustment(mouseY) {
    if (!this.adjustingKnob) {
      return;
    }

    const delta = this.adjustingKnob.startY - mouseY;
    const range = this.adjustingKnob.max - this.adjustingKnob.min;
    const normalizedDelta = (delta / this.adjustingKnob.sensitivity) * range;

    const newValue = Math.max(
      this.adjustingKnob.min,
      Math.min(this.adjustingKnob.max, this.adjustingKnob.startValue + normalizedDelta)
    );

    const node = this.adjustingKnob.node;
    const paramName = this.adjustingKnob.paramName;
    node[paramName] = newValue;
    if (paramName === 'frequencyRatio') {
      node.ratio = newValue;
    }
    node.updateParameter(paramName, newValue);
  }
  
  clear() {
    // Clear frontend state
    this.nodes = [];
    this.connections = [];
    this.selectedNode = null;
    this.selectedConnection = null;
    this.hideParameterPanel();
    
    // Send message to backend to clear the DSP graph
    if (window.__JUCE__ && window.__JUCE__.backend) {
      const message = JSON.stringify({
        type: "CLEAR_GRAPH"
      });
      window.__JUCE__.backend.emitEvent("messageFromJS", message);
      console.log("Sent CLEAR_GRAPH message to backend");
    }
  }
  
  render() {
    // Clear canvas
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw grid
    this.drawGrid();
    
    // Draw connections
    this.connections.forEach(conn => this.drawConnection(conn));
    
    // Draw connection being created
    if (this.isConnecting && this.connectionStart) {
      const startPos = this.connectionStart.node.getOutputPortPosition(this.connectionStart.portIndex);
      this.ctx.strokeStyle = '#4a90e2';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(startPos.x, startPos.y);
      this.ctx.lineTo(this.mousePos.x, this.mousePos.y);
      this.ctx.stroke();
    }
    
    // Draw all nodes
    this.nodes.forEach(node => {
      if (node instanceof OperatorNode) {
        const hoveredKnobName = this.hoveredKnob && this.hoveredKnob.node === node
          ? this.hoveredKnob.paramName
          : null;
        node.draw(this.ctx, hoveredKnobName);
      } else {
        node.draw(this.ctx);
      }
    });
  }
  
  drawConnection(conn) {
    const start = conn.fromNode.getOutputPortPosition(conn.fromPort);
    const end = conn.toNode.getInputPortPosition(conn.toPort);
    
    // Highlight if selected
    const isSelected = this.selectedConnection === conn;
    this.ctx.strokeStyle = isSelected ? '#ff6b6b' : '#4a90e2';
    this.ctx.lineWidth = isSelected ? 3 : 2;
    this.ctx.beginPath();
    this.ctx.moveTo(start.x, start.y);
    
    // Bezier curve for smooth connection
    const cpOffset = Math.abs(end.x - start.x) / 2;
    this.ctx.bezierCurveTo(
      start.x + cpOffset, start.y,
      end.x - cpOffset, end.y,
      end.x, end.y
    );
    this.ctx.stroke();
  }
  
  drawGrid() {
    const gridSize = 40;
    this.ctx.strokeStyle = '#2a2a2a';
    this.ctx.lineWidth = 1;
    
    for (let x = 0; x < this.canvas.width; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }
    
    for (let y = 0; y < this.canvas.height; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }
  }
  
  startRenderLoop() {
    const loop = () => {
      this.render();
      requestAnimationFrame(loop);
    };
    loop();
  }
  
  showParameterPanel(node) {
    const panel = document.getElementById('paramPanel');
    const title = document.getElementById('paramTitle');
    const controls = document.getElementById('paramControls');
    
    title.textContent = `${node.title} (ID: ${node.backendId})`;
    controls.innerHTML = '';
    
    // Only show ADSR for operators
    if (node instanceof OperatorNode) {
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
        this.drawAdsrEnvelope(envelopeCanvas, node);
      };

      this.createKnobParameterControl(knobGrid, 'Attack', 'attack', node.attack || 0.01, 0.001, 2, 3, node, redrawEnvelope);
      this.createKnobParameterControl(knobGrid, 'Decay', 'decay', node.decay || 0.1, 0.001, 2, 3, node, redrawEnvelope);
      this.createKnobParameterControl(knobGrid, 'Sustain', 'sustain', node.sustain || 0.7, 0, 1, 3, node, redrawEnvelope);
      this.createKnobParameterControl(knobGrid, 'Release', 'release', node.release || 0.3, 0.001, 5, 3, node, redrawEnvelope);

      redrawEnvelope();
    }
    
    panel.style.display = 'block';
  }
  
  showConnectionPanel(conn) {
    const panel = document.getElementById('paramPanel');
    const title = document.getElementById('paramTitle');
    const controls = document.getElementById('paramControls');
    
    title.textContent = `Connection: ${conn.fromNode.title} → ${conn.toNode.title}`;
    controls.innerHTML = '';
    
    // Create modulation index control
    this.createConnectionControl(controls, 'Modulation Index', 'amount', conn.amount, 0, 20, 0.1, conn);
    
    panel.style.display = 'block';
  }
  
  createConnectionControl(container, label, paramName, value, min, max, step, conn) {
    const div = document.createElement('div');
    div.className = 'param-control';
    
    const labelElem = document.createElement('label');
    labelElem.textContent = label;
    
    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'param-value';
    valueDisplay.textContent = value.toFixed(2);
    labelElem.appendChild(valueDisplay);
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;
    
    const numberInput = document.createElement('input');
    numberInput.type = 'number';
    numberInput.min = min;
    numberInput.max = max;
    numberInput.step = step;
    numberInput.value = value;
    
    const updateValue = (newValue) => {
      newValue = parseFloat(newValue);
      slider.value = newValue;
      numberInput.value = newValue;
      valueDisplay.textContent = newValue.toFixed(2);
      
      // Update connection property
      conn[paramName] = newValue;
      
      // Send to backend
      if (window.__JUCE__ && window.__JUCE__.backend) {
        const message = JSON.stringify({
          type: "UPDATE_CONNECTION",
          data: {
            sourceNodeId: conn.fromNode.backendId,
            destNodeId: conn.toNode.backendId,
            amount: newValue
          }
        });
        window.__JUCE__.backend.emitEvent("messageFromJS", message);
      }
    };
    
    slider.addEventListener('input', (e) => updateValue(e.target.value));
    numberInput.addEventListener('input', (e) => updateValue(e.target.value));
    
    div.appendChild(labelElem);
    div.appendChild(slider);
    div.appendChild(numberInput);
    container.appendChild(div);
  }
  
  hideParameterPanel() {
    const panel = document.getElementById('paramPanel');
    panel.style.display = 'none';
  }

  drawAdsrEnvelope(canvas, node) {
    const width = Math.max(100, canvas.clientWidth || 360);
    const height = Math.max(80, canvas.clientHeight || 120);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    const pad = 12;
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
    const sustainY = baseY - (sustain * graphHeight);
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
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`A ${attack.toFixed(3)}s`, x(attack) - 10, height - 3);
    ctx.fillText(`D ${decay.toFixed(3)}s`, x(attack + decay) - 10, height - 3);
    ctx.fillText(`S ${(sustain * 100).toFixed(0)}%`, x(attack + decay + hold) - 10, height - 3);
    ctx.fillText(`R ${release.toFixed(3)}s`, x(total) - 10, height - 3);

    ctx.fillStyle = '#bdbdbd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(
      `Attack ${attack.toFixed(3)}s  Decay ${decay.toFixed(3)}s  Sustain ${(sustain * 100).toFixed(0)}%  Release ${release.toFixed(3)}s`,
      width - pad,
      12
    );
  }

  createKnobParameterControl(container, label, paramName, value, min, max, precision, node, onChange) {
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

  emitNodeParameterUpdate(node, paramName, value) {
    if (window.__JUCE__ && window.__JUCE__.backend && node.backendId) {
      const message = JSON.stringify({
        type: "UPDATE_NODE_PARAMETER",
        data: {
          nodeId: node.backendId,
          paramName: paramName,
          value: value
        }
      });
      window.__JUCE__.backend.emitEvent("messageFromJS", message);
    }
  }
  
  createParameterControl(container, label, paramName, value, min, max, step, node) {
    const div = document.createElement('div');
    div.className = 'param-control';
    
    const labelElem = document.createElement('label');
    labelElem.textContent = label;
    
    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'param-value';
    valueDisplay.textContent = value.toFixed(3);
    labelElem.appendChild(valueDisplay);
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;
    
    const numberInput = document.createElement('input');
    numberInput.type = 'number';
    numberInput.min = min;
    numberInput.max = max;
    numberInput.step = step;
    numberInput.value = value;
    
    const updateValue = (newValue) => {
      newValue = parseFloat(newValue);
      slider.value = newValue;
      numberInput.value = newValue;
      valueDisplay.textContent = newValue.toFixed(3);
      
      // Update node property
      node[paramName] = newValue;
      
      // Send to backend
      if (window.__JUCE__ && window.__JUCE__.backend && node.backendId) {
        const message = JSON.stringify({
          type: "UPDATE_NODE_PARAMETER",
          data: {
            nodeId: node.backendId,
            paramName: paramName,
            value: newValue
          }
        });
        window.__JUCE__.backend.emitEvent("messageFromJS", message);
      }
    };
    
    slider.addEventListener('input', (e) => updateValue(e.target.value));
    numberInput.addEventListener('input', (e) => updateValue(e.target.value));
    
    div.appendChild(labelElem);
    div.appendChild(slider);
    div.appendChild(numberInput);
    container.appendChild(div);
  }
}

// Base Node Class
class Node {
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
    // Draw node body
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(this.x, this.y, this.width, this.height);
    
    // Draw border
    ctx.strokeStyle = '#4a90e2';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x, this.y, this.width, this.height);
    
    // Draw title bar
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(this.x, this.y, this.width, 25);
    
    // Draw title text
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.title, this.x + this.width / 2, this.y + 17);
    
    // Draw inputs
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
    
    // Draw outputs
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
    
    // Call subclass-specific drawing
    this.drawParameters(ctx, isHovered);
  }
  
  // Override in subclasses to draw parameters
  drawParameters(ctx, isHovered = false) {
    // No parameters by default
  }
}

// Operator Node (FM Oscillator)
class OperatorNode extends Node {
  constructor(x, y) {
    super('Operator', x, y);
    this.inputs = ['FM In'];
    this.outputs = ['Audio'];
    this.frequencyRatio = 1.0;
    this.ratio = 1.0; // Alias for frequencyRatio
    this.amplitude = 0.5;
    
    // ADSR Envelope parameters
    this.attack = 0.01;    // 10ms default attack
    this.decay = 0.1;      // 100ms default decay
    this.sustain = 0.7;    // 70% sustain level
    this.release = 0.3;    // 300ms default release
    
    // Adjust height to accommodate parameters
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

    // Knob body
    ctx.beginPath();
    ctx.arc(knob.x, knob.y, knob.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#2f2f2f';
    ctx.fill();
    ctx.strokeStyle = isHovered ? '#ff9800' : '#4a90e2';
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.stroke();

    // Sweep track
    ctx.beginPath();
    ctx.arc(knob.x, knob.y, knob.radius + 3, startAngle, startAngle + sweep);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Active value arc
    ctx.beginPath();
    ctx.arc(knob.x, knob.y, knob.radius + 3, startAngle, valueAngle);
    ctx.strokeStyle = '#6ab0f3';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pointer line
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

    // Label and value
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(knob.label, knob.x, knob.y - knob.radius - 7);

    ctx.fillStyle = '#6ab0f3';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(knob.value.toFixed(3), knob.x, knob.y + knob.radius + 12);
  }

  drawParameters(ctx, hoveredKnobName = null) {
    // Draw background plate for knobs
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(this.x + 5, this.y + 40, this.width - 10, 50);

    for (const knob of this.getKnobs()) {
      this.drawKnob(ctx, knob, hoveredKnobName === knob.paramName);
    }
  }
  
  // Handle click on parameters
  onParameterClick(x, y, graph) {
    const knob = this.getKnobAt(x, y);
    if (knob) {
      graph.beginKnobAdjustment(this, knob, y);
      return true;
    }
    return false;
  }
  
  updateParameter(paramName, value) {
    if (window.__JUCE__ && window.__JUCE__.backend && this.backendId) {
      const message = JSON.stringify({
        type: "UPDATE_NODE_PARAMETER",
        data: {
          nodeId: this.backendId,
          paramName: paramName,
          value: value
        }
      });
      window.__JUCE__.backend.emitEvent("messageFromJS", message);
      console.log('Updated parameter:', paramName, '=', value);
    }
  }
}

// Output Node
class OutputNode extends Node {
  constructor(x, y) {
    super('Output', x, y);
    this.inputs = ['Audio'];
  }
}

// Initialize the graph
const canvas = document.getElementById('canvas');
window.nodeGraph = new NodeGraph(canvas);

console.log("NodeGraph initialized");

// Set initialization data
if (window.__JUCE__ && window.__JUCE__.initialisationData) {
  const data = window.__JUCE__.initialisationData;
  const infoElement = document.getElementById("info");
  if (infoElement) {
    infoElement.innerHTML = data.info || "NodeFM Synth";
  }
  console.log("Initialization data set");
}

// Listen for NODE_ADDED event from backend
if (window.__JUCE__ && window.__JUCE__.backend) {
  console.log("Setting up NODE_ADDED event listener...");
  
  window.__JUCE__.backend.addEventListener("NODE_ADDED", function(event) {
    console.log("Received NODE_ADDED event:", event);
    console.log("Event type:", typeof event);
    
    try {
      const data = typeof event === 'string' ? JSON.parse(event) : event;
      console.log("Parsed data:", data);
      
      const nodeData = data.data || data;
      console.log("Node data:", nodeData);
      
      let node;
      if (nodeData.type === "output") {
        console.log("Creating Output node at (420, 100)");
        node = new OutputNode(420, 100);
      } else if (nodeData.type === "operator" || nodeData.type === "oscillator") {
        console.log("Creating Operator node at (140, 100)");
        node = new OperatorNode(140, 100);
      }
      
      if (node) {
        node.backendId = nodeData.id;

        const params = nodeData.data || {};
        if (node instanceof OperatorNode) {
          if (params.frequencyRatio !== undefined) node.frequencyRatio = parseFloat(params.frequencyRatio);
          if (params.amplitude !== undefined) node.amplitude = parseFloat(params.amplitude);
          if (params.attack !== undefined) node.attack = parseFloat(params.attack);
          if (params.decay !== undefined) node.decay = parseFloat(params.decay);
          if (params.sustain !== undefined) node.sustain = parseFloat(params.sustain);
          if (params.release !== undefined) node.release = parseFloat(params.release);
          node.ratio = node.frequencyRatio;
        }

        window.nodeGraph.addNode(node);
        console.log("Added", nodeData.type, "node (ID:", nodeData.id, ") to canvas. Total nodes:", window.nodeGraph.nodes.length);
      } else {
        console.warn("Node was not created for type:", nodeData.type);
      }
    } catch (e) {
      console.error("Error handling NODE_ADDED:", e);
    }
  });
  
  console.log("NODE_ADDED event listener registered");

  window.__JUCE__.backend.addEventListener("CONNECTION_ADDED", function(event) {
    console.log("Received CONNECTION_ADDED event:", event);

    try {
      const data = typeof event === 'string' ? JSON.parse(event) : event;
      const connectionData = data.data || data;

      const added = window.nodeGraph.addConnectionFromBackend(
        connectionData.sourceNodeId,
        connectionData.destNodeId,
        connectionData.amount ?? 1.0
      );

      console.log(added
        ? "Added backend connection to canvas"
        : "Deferred backend connection because a node was not yet available");
    } catch (e) {
      console.error("Error handling CONNECTION_ADDED:", e);
    }
  });

  console.log("CONNECTION_ADDED event listener registered");
  
  // Listen for GRAPH_CLEARED event from backend
  window.__JUCE__.backend.addEventListener("GRAPH_CLEARED", function(event) {
    console.log("Received GRAPH_CLEARED event:", event);
    console.log("Backend graph cleared; waiting for default node sync events.");
  });
  
  console.log("GRAPH_CLEARED event listener registered");
} else {
  console.warn("JUCE backend not available!");
}

// Button event listeners
document.getElementById('addOperatorBtn').addEventListener('click', function() {
  // Send to backend - node will be added when backend confirms
  if (window.__JUCE__ && window.__JUCE__.backend) {
    const message = JSON.stringify({
      type: "ADD_NODE",
      nodeType: "operator",
      data: {
        frequencyRatio: 1.0,
        amplitude: 0.5,
        attack: 0.01,
        decay: 0.1,
        sustain: 0.7,
        release: 0.3
      }
    });
    window.__JUCE__.backend.emitEvent("messageFromJS", message);
    console.log("Sent operator request to backend");
  }
});

document.getElementById('clearGraphBtn').addEventListener('click', function() {
  window.nodeGraph.clear();
});

console.log("NodeFM Frontend initialized");