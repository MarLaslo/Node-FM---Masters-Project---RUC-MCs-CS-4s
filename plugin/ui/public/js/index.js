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
        console.log('Starting connection from', node.title, 'output', port);
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
          console.log('Connected:', this.connectionStart.node.title, '->', node.title);
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
      console.log('Sent connection to backend:', message);
    }
  }
  
  addNode(node) {
    this.nodes.push(node);
    console.log('Added node:', node.title, 'Total nodes:', this.nodes.length);
  }
  
  clear() {
    this.nodes = [];
    this.connections = [];
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
    this.nodes.forEach(node => node.draw(this.ctx));
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
    
    // Create controls based on node type
    if (node instanceof OperatorNode) {
      // Synthesis parameters
      const synthSection = document.createElement('div');
      synthSection.innerHTML = '<h3>Synthesis</h3>';
      controls.appendChild(synthSection);
      
      this.createParameterControl(controls, 'Frequency Ratio', 'frequencyRatio', node.frequencyRatio || node.ratio, 0.125, 8, 0.125, node);
      this.createParameterControl(controls, 'Amplitude', 'amplitude', node.amplitude, 0, 1, 0.01, node);
      
      // ADSR Envelope section
      const adsrSection = document.createElement('div');
      adsrSection.innerHTML = '<h3>ADSR Envelope</h3>';
      controls.appendChild(adsrSection);
      
      this.createParameterControl(controls, 'Attack (s)', 'attack', node.attack, 0.001, 2, 0.001, node);
      this.createParameterControl(controls, 'Decay (s)', 'decay', node.decay, 0.001, 2, 0.001, node);
      this.createParameterControl(controls, 'Sustain', 'sustain', node.sustain, 0, 1, 0.01, node);
      this.createParameterControl(controls, 'Release (s)', 'release', node.release, 0.001, 5, 0.001, node);
    } else if (node instanceof OscillatorNode) {
      this.createParameterControl(controls, 'Frequency', 'frequency', node.frequency, 20, 2000, 1, node);
      this.createParameterControl(controls, 'Amplitude', 'amplitude', node.amplitude, 0, 1, 0.01, node);
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
        console.log('Updated connection amount:', newValue);
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
        console.log('Updated parameter:', paramName, '=', newValue);
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
  
  draw(ctx) {
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
  }
}

// Oscillator Node
class OscillatorNode extends Node {
  constructor(x, y) {
    super('Oscillator', x, y);
    this.inputs = ['FM In'];
    this.outputs = ['Audio'];
    this.frequency = 440;
    this.amplitude = 0.5;
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
      } else if (nodeData.type === "oscillator") {
        console.log("Creating Oscillator node at (300, 100)");
        node = new OscillatorNode(300, 100);
      } else if (nodeData.type === "operator") {
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
} else {
  console.warn("JUCE backend not available!");
}

// Button event listeners
document.getElementById('addOscillatorBtn').addEventListener('click', function() {
  // Send to backend - node will be added when backend confirms
  if (window.__JUCE__ && window.__JUCE__.backend) {
    const message = JSON.stringify({
      type: "ADD_NODE",
      nodeType: "oscillator",
      data: {
        frequency: 440,
        amplitude: 0.5
      }
    });
    window.__JUCE__.backend.emitEvent("messageFromJS", message);
    console.log("Sent oscillator request to backend");
  }
});

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