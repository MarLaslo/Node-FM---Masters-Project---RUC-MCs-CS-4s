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
    this.isConnecting = false;
    this.connectionStart = null;
    this.selectedConnection = null;
    this.mousePos = { x: 0, y: 0 };
    this.hoveredParamNode = null; // Track which node's params are hovered
    
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
    
    // Update cursor and hover state based on what's under the mouse
    let cursorStyle = 'default';
    this.hoveredParamNode = null;
    
    // Check if hovering over a parameter area
    for (let node of this.nodes) {
      if (node instanceof OperatorNode) {
        if (pos.y >= node.y + 25 && pos.y <= node.y + 95 && 
            pos.x >= node.x && pos.x <= node.x + node.width) {
          cursorStyle = 'pointer';
          this.hoveredParamNode = node;
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
        node.draw(this.ctx, node === this.hoveredParamNode);
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
      // ADSR Envelope section
      const adsrSection = document.createElement('div');
      adsrSection.innerHTML = '<h3>ADSR Envelope</h3>';
      controls.appendChild(adsrSection);
      
      this.createParameterControl(controls, 'Attack (s)', 'attack', node.attack || 0.01, 0.001, 2, 0.001, node);
      this.createParameterControl(controls, 'Decay (s)', 'decay', node.decay || 0.1, 0.001, 2, 0.001, node);
      this.createParameterControl(controls, 'Sustain', 'sustain', node.sustain || 0.7, 0, 1, 0.01, node);
      this.createParameterControl(controls, 'Release (s)', 'release', node.release || 0.3, 0.001, 5, 0.001, node);
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
  
  drawParameters(ctx, isHovered = false) {
    // Draw FM parameters on the node
    const centerX = this.x + this.width / 2;
    const paramY = this.y + 55;
    
    // Background for parameters
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(this.x + 5, this.y + 40, this.width - 10, 55);
    
    // Highlight parameter boxes
    const ratioBoxY = this.y + 45;
    const ampBoxY = this.y + 67;
    
    // Ratio box background with hover effect
    ctx.fillStyle = isHovered ? '#3a3a3a' : '#333';
    ctx.fillRect(this.x + 8, ratioBoxY, this.width - 16, 18);
    ctx.strokeStyle = isHovered ? '#ff9800' : '#4a90e2';
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.strokeRect(this.x + 8, ratioBoxY, this.width - 16, 18);
    
    // Amplitude box background with hover effect
    ctx.fillStyle = isHovered ? '#3a3a3a' : '#333';
    ctx.fillRect(this.x + 8, ampBoxY, this.width - 16, 18);
    ctx.strokeStyle = isHovered ? '#ff9800' : '#4a90e2';
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.strokeRect(this.x + 8, ampBoxY, this.width - 16, 18);
    
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    
    // Frequency ratio
    ctx.fillStyle = '#888';
    ctx.fillText('Ratio:', this.x + 12, paramY);
    ctx.fillStyle = '#6ab0f3';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(this.frequencyRatio.toFixed(3), this.x + this.width - 12, paramY);
    
    // Amplitude
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#888';
    ctx.fillText('Amp:', this.x + 12, paramY + 22);
    ctx.fillStyle = '#6ab0f3';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(this.amplitude.toFixed(3), this.x + this.width - 12, paramY + 22);
  }
  
  // Handle click on parameters
  onParameterClick(x, y, graph) {
    // Check if clicking in parameter area (expanded for easier clicking)
    const paramAreaTop = this.y + 25; // Just below title
    const paramAreaBottom = this.y + 95; // Bottom of param area
    const paramAreaLeft = this.x;
    const paramAreaRight = this.x + this.width;
    
    console.log('Parameter click check:', {x, y, paramAreaTop, paramAreaBottom, paramAreaLeft, paramAreaRight});
    
    if (y >= paramAreaTop && y <= paramAreaBottom && 
        x >= paramAreaLeft && x <= paramAreaRight) {
      
      console.log('✓ Click is in parameter area!');
      
      // Ratio box: y 45-63
      // Amp box: y 67-85
      const ratioBoxBottom = this.y + 63;
      
      if (y < ratioBoxBottom) {
        console.log('Editing Ratio');
        this.showInputOverlay('frequencyRatio', this.frequencyRatio, 0.125, 8, 0.001, this.y + 45);
      } else {
        console.log('Editing Amplitude');
        this.showInputOverlay('amplitude', this.amplitude, 0, 1, 0.01, this.y + 67);
      }
      return true;
    }
    console.log('✗ Click is outside parameter area');
    return false;
  }
  
  showInputOverlay(paramName, currentValue, min, max, step, topPosition) {
    console.log('showInputOverlay called:', {paramName, currentValue, topPosition});
    
    // Remove any existing input overlays first
    const existingOverlay = document.querySelector('.param-input-overlay');
    if (existingOverlay) {
      console.log('Removing existing overlay');
      existingOverlay.remove();
    }
    
    // Create an overlay input element
    const input = document.createElement('input');
    input.className = 'param-input-overlay';
    input.type = 'number';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = currentValue;
    input.style.position = 'absolute';
    input.style.width = (this.width - 20) + 'px';
    input.style.height = '18px';
    input.style.padding = '2px 4px';
    input.style.fontSize = '11px';
    input.style.fontFamily = 'monospace';
    input.style.fontWeight = 'bold';
    input.style.border = '2px solid #ff9800';
    input.style.background = '#1a1a1a';
    input.style.color = '#6ab0f3';
    input.style.borderRadius = '3px';
    input.style.zIndex = '10000';
    input.style.outline = 'none';
    input.style.boxShadow = '0 0 10px rgba(255, 152, 0, 0.5)';
    
    const canvas = document.getElementById('canvas');
    const canvasRect = canvas.getBoundingClientRect();
    input.style.left = (canvasRect.left + this.x + 10) + 'px';
    input.style.top = (canvasRect.top + topPosition) + 'px';
    
    console.log('Input positioned at:', input.style.left, input.style.top);
    
    document.body.appendChild(input);
    console.log('Input overlay added to DOM');
    
    // Focus after a tiny delay to ensure it's rendered
    setTimeout(() => {
      input.focus();
      input.select();
      console.log('Input focused and selected');
    }, 10);
    
    const removeInput = () => {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };
    
    input.addEventListener('blur', () => {
      const newValue = parseFloat(input.value);
      if (!isNaN(newValue) && newValue >= min && newValue <= max) {
        this[paramName] = newValue;
        if (paramName === 'frequencyRatio') {
          this.ratio = newValue;
        }
        this.updateParameter(paramName, newValue);
      }
      removeInput();
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur();
      } else if (e.key === 'Escape') {
        removeInput();
      }
    });
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
        console.log("Creating Output node at (100, 100)");
        node = new OutputNode(100, 100);
      } else if (nodeData.type === "operator" || nodeData.type === "oscillator") {
        console.log("Creating Operator node at (300, 100)");
        node = new OperatorNode(300, 100);
      }
      
      if (node) {
        node.backendId = nodeData.id;
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
  
  // Listen for GRAPH_CLEARED event from backend
  window.__JUCE__.backend.addEventListener("GRAPH_CLEARED", function(event) {
    console.log("Received GRAPH_CLEARED event:", event);
    
    try {
      const data = typeof event === 'string' ? JSON.parse(event) : event;
      console.log("Parsed data:", data);
      
      const nodeData = data.data || data;
      console.log("Output node data:", nodeData);
      
      // Recreate the output node
      const outputNode = new OutputNode(100, 100);
      outputNode.backendId = nodeData.id;
      window.nodeGraph.addNode(outputNode);
      console.log("Recreated output node (ID:", nodeData.id, ") after graph clear");
    } catch (e) {
      console.error("Error handling GRAPH_CLEARED:", e);
    }
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