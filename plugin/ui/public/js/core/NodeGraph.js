import { emitToBackend } from './backendApi.js';
import { OperatorNode } from './nodes/OperatorNode.js';
import { AdsrPanel } from './ui/AdsrPanel.js';

export class NodeGraph {
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
    this.hoveredParamNode = null;
    this.hoveredKnob = null;
    this.lastPositionSyncTime = 0;
    this.onCanvasDoubleClick = null;
    this.lastCanvasDoubleClickTime = 0;
    this.lastCanvasClickTime = 0;
    this.lastCanvasClickPos = null;
    this.adsrPanel = new AdsrPanel((node, paramName, value) => this.emitNodeParameterUpdate(node, paramName, value));

    this.setupCanvas();
    this.setupEventListeners();
    this.startRenderLoop();
  }

  setupCanvas() {
    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight - 50;
    };

    resize();
    window.addEventListener('resize', resize);
  }

  setupEventListeners() {
    const usePointerEvents = typeof window.PointerEvent === 'function';

    if (usePointerEvents) {
      this.canvas.style.touchAction = 'none';
      this.canvas.addEventListener('pointerdown', (e) => this.onMouseDown(e));
      this.canvas.addEventListener('pointermove', (e) => this.onMouseMove(e));
      this.canvas.addEventListener('pointerup', (e) => this.onMouseUp(e));

      window.addEventListener('pointermove', (e) => this.onMouseMove(e));
      window.addEventListener('pointerup', (e) => this.onMouseUp(e));
      window.addEventListener('pointercancel', (e) => this.onMouseUp(e));
    } else {
      this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
      this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
      this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));

      window.addEventListener('mousemove', (e) => this.onMouseMove(e));
      window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }

    this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
  }

  setCanvasDoubleClickHandler(handler) {
    this.onCanvasDoubleClick = handler;
  }

  syncNodePosition(node, force = false) {
    if (!node || !node.backendId) {
      return;
    }

    const now = performance.now();
    if (!force && now - this.lastPositionSyncTime < 80) {
      return;
    }

    emitToBackend({
      type: 'UPDATE_NODE_POSITION',
      data: {
        nodeId: node.backendId,
        x: node.x,
        y: node.y
      }
    });
    this.lastPositionSyncTime = now;
  }

  syncAllNodePositions(force = true) {
    if (!Array.isArray(this.nodes)) {
      return;
    }

    this.nodes.forEach((node) => this.syncNodePosition(node, force));
  }

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  onMouseDown(e) {
    if (typeof e.button === 'number' && e.button !== 0) {
      return;
    }

    const pos = this.getMousePos(e);
    const now = performance.now();

    const isNativeDoubleClick = e.detail === 2;
    const isCustomDoubleClick = (() => {
      if (!this.lastCanvasClickPos) {
        return false;
      }

      // Embedded DAW webviews may report click cadence less consistently than standalone.
      const withinTime = now - this.lastCanvasClickTime <= 450;
      const dx = pos.x - this.lastCanvasClickPos.x;
      const dy = pos.y - this.lastCanvasClickPos.y;
      const withinDistance = (dx * dx + dy * dy) <= (12 * 12);
      return withinTime && withinDistance;
    })();

    this.lastCanvasClickTime = now;
    this.lastCanvasClickPos = pos;

    if (isNativeDoubleClick || isCustomDoubleClick) {
      this.onDoubleClick(e);
      return;
    }

    for (const node of this.nodes) {
      const port = node.getOutputPortAt(pos.x, pos.y);
      if (port !== null) {
        this.isConnecting = true;
        this.connectionStart = { node, portIndex: port };
        return;
      }
    }

    for (let i = this.connections.length - 1; i >= 0; i--) {
      const conn = this.connections[i];
      if (this.isPointNearConnection(pos, conn)) {
        this.selectedConnection = conn;
        this.showConnectionPanel(conn);
        return;
      }
    }

    let nodeClicked = false;
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      if (
        pos.x >= node.x &&
        pos.x <= node.x + node.width &&
        pos.y >= node.y &&
        pos.y <= node.y + node.height
      ) {
        if (typeof node.onParameterClick === 'function') {
          const handled = node.onParameterClick(pos.x, pos.y, this);
          if (handled) return;
        }

        this.selectedNode = node;
        this.isDragging = true;
        this.dragOffset = { x: pos.x - node.x, y: pos.y - node.y };
        nodeClicked = true;
        this.selectedConnection = null;

        this.showParameterPanel(node);
        break;
      }
    }

    if (!nodeClicked) {
      this.hideParameterPanel();
      this.selectedConnection = null;
    }
  }

  onMouseMove(e) {
    const pos = this.getMousePos(e);
    this.mousePos = pos;

    if (this.isAdjustingKnob && this.adjustingKnob) {
      this.updateKnobAdjustment(pos.y);
      return;
    }

    let cursorStyle = 'default';
    this.hoveredParamNode = null;

    for (const node of this.nodes) {
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
      this.syncNodePosition(this.selectedNode, false);
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

      for (const node of this.nodes) {
        const port = node.getInputPortAt(pos.x, pos.y);
        if (port !== null && node !== this.connectionStart.node) {
          this.addConnection(this.connectionStart.node, this.connectionStart.portIndex, node, port);
          break;
        }
      }

      this.isConnecting = false;
      this.connectionStart = null;
    }

    if (this.isDragging && this.selectedNode) {
      this.syncNodePosition(this.selectedNode, true);
    }

    this.isDragging = false;
  }

  onDoubleClick(e) {
    const now = performance.now();
    if (now - this.lastCanvasDoubleClickTime < 150) {
      return;
    }
    this.lastCanvasDoubleClickTime = now;

    const pos = this.getMousePos(e);

    const clickedNode = this.nodes.some((node) => (
      pos.x >= node.x &&
      pos.x <= node.x + node.width &&
      pos.y >= node.y &&
      pos.y <= node.y + node.height
    ));

    if (clickedNode) {
      return;
    }

    if (typeof this.onCanvasDoubleClick === 'function') {
      this.onCanvasDoubleClick(pos);
    }
  }

  isPointNearConnection(point, conn) {
    const start = conn.fromNode.getOutputPortPosition(conn.fromPort);
    const end = conn.toNode.getInputPortPosition(conn.toPort);

    const threshold = 10;
    const dist = this.distanceToLineSegment(point, start, end);
    return dist < threshold;
  }

  distanceToLineSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return Math.sqrt((point.x - start.x) ** 2 + (point.y - start.y) ** 2);
    }

    let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    const projX = start.x + t * dx;
    const projY = start.y + t * dy;

    return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
  }

  addConnection(fromNode, fromPort, toNode, toPort) {
    const connection = {
      fromNode,
      fromPort,
      toNode,
      toPort,
      amount: 1.0
    };
    this.connections.push(connection);

    emitToBackend({
      type: 'ADD_CONNECTION',
      data: {
        sourceNodeId: fromNode.backendId,
        destNodeId: toNode.backendId,
        amount: connection.amount
      }
    });
  }

  addNode(node) {
    this.nodes.push(node);
  }

  findNodeByBackendId(backendId) {
    return this.nodes.find((node) => node.backendId === backendId) || null;
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

  clear(sendBackendUpdate = true) {
    this.nodes = [];
    this.connections = [];
    this.selectedNode = null;
    this.selectedConnection = null;
    this.hideParameterPanel();

    if (sendBackendUpdate) {
      emitToBackend({ type: 'CLEAR_GRAPH' });
    }
  }

  applyGraphState(snapshot) {
    const graphState = snapshot || {};
    const nodes = Array.isArray(graphState.nodes) ? graphState.nodes : [];
    const connections = Array.isArray(graphState.connections) ? graphState.connections : [];

    this.clear(false);

    const outputNodeId = parseInt(graphState.outputNodeId, 10);
    const operatorNodeId = parseInt(graphState.operatorNodeId, 10);

    nodes.sort((a, b) => (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0));

    let defaultOperatorRow = 0;
    let defaultOutputRow = 0;

    nodes.forEach((nodeData) => {
      const nodeType = (nodeData.type || '').toLowerCase();
      let node = null;

      if (nodeType === 'output') {
        node = this.createOutputNode(420, 120 + defaultOutputRow * 90);
        defaultOutputRow += 1;
      } else if (nodeType === 'operator' || nodeType === 'oscillator') {
        node = this.createOperatorNode(140, 120 + defaultOperatorRow * 90);
        defaultOperatorRow += 1;
      }

      if (!node) {
        return;
      }

      this.assignBackendNodeData(node, nodeData);

      const position = nodeData.position || {};
      if (position.x !== undefined && position.y !== undefined) {
        node.x = parseFloat(position.x);
        node.y = parseFloat(position.y);
      }

      if (node.backendId === outputNodeId && (position.x === undefined || position.y === undefined)) {
        node.x = 420;
        node.y = 120;
      } else if (node.backendId === operatorNodeId && (position.x === undefined || position.y === undefined)) {
        node.x = 140;
        node.y = 120;
      }

      this.addNode(node);
    });

    connections.forEach((connectionData) => {
      this.addConnectionFromBackend(
        parseInt(connectionData.sourceNodeId, 10),
        parseInt(connectionData.destNodeId, 10),
        connectionData.amount ?? 1.0
      );
    });

    this.syncAllNodePositions(true);
  }

  assignBackendNodeData(node, nodeData) {
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
  }

  createOperatorNode(x, y) {
    return new OperatorNode(x, y);
  }

  createOutputNode(x, y) {
    throw new Error('createOutputNode must be provided by subclass or composition');
  }

  render() {
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawGrid();

    this.ctx.save();

    this.connections.forEach((conn) => this.drawConnection(conn));

    if (this.isConnecting && this.connectionStart) {
      const startPos = this.connectionStart.node.getOutputPortPosition(this.connectionStart.portIndex);
      this.ctx.strokeStyle = '#4a90e2';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(startPos.x, startPos.y);
      this.ctx.lineTo(this.mousePos.x, this.mousePos.y);
      this.ctx.stroke();
    }

    this.nodes.forEach((node) => {
      if (node instanceof OperatorNode) {
        const hoveredKnobName = this.hoveredKnob && this.hoveredKnob.node === node
          ? this.hoveredKnob.paramName
          : null;
        node.draw(this.ctx, hoveredKnobName);
      } else {
        node.draw(this.ctx);
      }
    });

    this.ctx.restore();
  }

  drawConnection(conn) {
    const start = conn.fromNode.getOutputPortPosition(conn.fromPort);
    const end = conn.toNode.getInputPortPosition(conn.toPort);

    const isSelected = this.selectedConnection === conn;
    this.ctx.strokeStyle = isSelected ? '#ff6b6b' : '#4a90e2';
    this.ctx.lineWidth = isSelected ? 3 : 2;
    this.ctx.beginPath();
    this.ctx.moveTo(start.x, start.y);

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

    if (node instanceof OperatorNode) {
      panel.classList.add('adsr-compact');
      this.adsrPanel.render(controls, node);
    } else {
      panel.classList.remove('adsr-compact');
    }

    panel.style.display = 'block';
  }

  showConnectionPanel(conn) {
    const panel = document.getElementById('paramPanel');
    const title = document.getElementById('paramTitle');
    const controls = document.getElementById('paramControls');

    panel.classList.remove('adsr-compact');

    title.textContent = `Connection: ${conn.fromNode.title} -> ${conn.toNode.title}`;
    controls.innerHTML = '';

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
      const parsed = parseFloat(newValue);
      slider.value = parsed;
      numberInput.value = parsed;
      valueDisplay.textContent = parsed.toFixed(2);

      conn[paramName] = parsed;

      emitToBackend({
        type: 'UPDATE_CONNECTION',
        data: {
          sourceNodeId: conn.fromNode.backendId,
          destNodeId: conn.toNode.backendId,
          amount: parsed
        }
      });
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
    panel.classList.remove('adsr-compact');
    panel.style.display = 'none';
  }

  emitNodeParameterUpdate(node, paramName, value) {
    if (!node.backendId) {
      return;
    }

    emitToBackend({
      type: 'UPDATE_NODE_PARAMETER',
      data: {
        nodeId: node.backendId,
        paramName,
        value
      }
    });
  }
}
