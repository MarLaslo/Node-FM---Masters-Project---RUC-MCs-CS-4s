import { emitToBackend } from './api/backendApi.js';
import { FilterNode } from './nodes/FilterNode.js';
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
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.panStartOffset = { x: 0, y: 0 };
    this.isAdjustingKnob = false;
    this.adjustingKnob = null;
    this.isConnecting = false;
    this.connectionStart = null;
    this.selectedConnection = null;
    this.hoveredConnection = null;
    this.isAdjustingConnection = false;
    this.adjustingConnection = null;
    this.mousePos = { x: 0, y: 0 };
    this.hoveredParamNode = null;
    this.hoveredKnob = null;
    this.lastPositionSyncTime = 0;
    this.onCanvasDoubleClick = null;
    this.lastCanvasDoubleClickTime = 0;
    this.lastCanvasClickTime = 0;
    this.lastCanvasClickPos = null;
    this.contextMenuElement = null;
    this.contextMenuListElement = null;
    this.contextMenuNode = null;
    this.contextMenuConnection = null;
    this.contextMenuCanvasPosition = null;
    this.onCanvasAddNodeRequested = null;
    this.viewScale = 1;
    this.viewOffset = { x: 0, y: 0 };
    this.minZoom = 0.4;
    this.maxZoom = 2.4;
    this.zoomStep = 1.1;
    this.parameterPanelMinimized = false;
    this.adsrPanel = new AdsrPanel((node, paramName, value) => this.emitNodeParameterUpdate(node, paramName, value));

    this.initializeParameterPanelState();
    this.setupCanvas();
    this.setupEventListeners();
    this.startRenderLoop();
  }

  initializeParameterPanelState() {
    const storedValue = window.localStorage.getItem('nodefm.paramPanelMinimized');
    this.parameterPanelMinimized = storedValue === '1';

    const toggleButton = document.getElementById('paramPanelToggle');
    if (toggleButton) {
      toggleButton.addEventListener('click', () => {
        this.parameterPanelMinimized = !this.parameterPanelMinimized;
        window.localStorage.setItem('nodefm.paramPanelMinimized', this.parameterPanelMinimized ? '1' : '0');
        this.applyParameterPanelState();
      });
    }

    this.applyParameterPanelState();
  }

  applyParameterPanelState() {
    const panel = document.getElementById('paramPanel');
    const toggleButton = document.getElementById('paramPanelToggle');
    if (!panel || !toggleButton) {
      return;
    }

    panel.classList.toggle('is-minimized', this.parameterPanelMinimized);
    toggleButton.textContent = this.parameterPanelMinimized ? '+' : '_';
    toggleButton.title = this.parameterPanelMinimized ? 'Expand panel' : 'Minimize panel';
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
      window.addEventListener('pointerdown', (e) => this.onGlobalPointerDown(e));
    } else {
      this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
      this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
      this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));

      window.addEventListener('mousemove', (e) => this.onMouseMove(e));
      window.addEventListener('mouseup', (e) => this.onMouseUp(e));
      window.addEventListener('mousedown', (e) => this.onGlobalPointerDown(e));
    }

    this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    this.canvas.addEventListener('contextmenu', (e) => this.onContextMenu(e));
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  onKeyDown(e) {
    if (!e) {
      return;
    }

    const isDeletionKey = e.key === 'Delete' || e.key === 'Backspace';
    if (!isDeletionKey) {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement) {
      const tagName = (activeElement.tagName || '').toLowerCase();
      const isTypingTarget =
        activeElement.isContentEditable
        || tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select';

      if (isTypingTarget) {
        return;
      }
    }

    if (this.selectedNode && !this.isNodeProtectedFromDeletion(this.selectedNode)) {
      this.removeNode(this.selectedNode, true);
      this.hideContextMenu();
      e.preventDefault();
      return;
    }

    if (this.selectedConnection) {
      this.removeConnection(this.selectedConnection, true);
      this.hideContextMenu();
      e.preventDefault();
    }
  }

  setCanvasDoubleClickHandler(handler) {
    this.onCanvasDoubleClick = handler;
  }

  setCanvasAddNodeHandler(handler) {
    this.onCanvasAddNodeRequested = handler;
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
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    return {
      x: (screenX - this.viewOffset.x) / this.viewScale,
      y: (screenY - this.viewOffset.y) / this.viewScale
    };
  }

  getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  onWheel(e) {
    e.preventDefault();

    const direction = e.deltaY < 0 ? 1 : -1;
    if (direction > 0) {
      this.zoomBy(this.zoomStep, e.clientX, e.clientY);
    } else {
      this.zoomBy(1 / this.zoomStep, e.clientX, e.clientY);
    }
  }

  zoomIn() {
    this.zoomBy(this.zoomStep, this.canvas.width / 2, this.canvas.height / 2, true);
  }

  zoomOut() {
    this.zoomBy(1 / this.zoomStep, this.canvas.width / 2, this.canvas.height / 2, true);
  }

  resetZoom() {
    this.viewScale = 1;
    this.viewOffset = { x: 0, y: 0 };
  }

  zoomBy(zoomFactor, screenX, screenY, useCanvasSpace = false) {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = useCanvasSpace ? screenX : (screenX - rect.left);
    const canvasY = useCanvasSpace ? screenY : (screenY - rect.top);

    const oldScale = this.viewScale;
    const newScale = Math.max(this.minZoom, Math.min(this.maxZoom, oldScale * zoomFactor));

    if (Math.abs(newScale - oldScale) < 1e-6) {
      return;
    }

    const worldX = (canvasX - this.viewOffset.x) / oldScale;
    const worldY = (canvasY - this.viewOffset.y) / oldScale;

    this.viewScale = newScale;
    this.viewOffset.x = canvasX - worldX * newScale;
    this.viewOffset.y = canvasY - worldY * newScale;
    this.hideContextMenu();
  }

  onMouseDown(e) {
    this.hideContextMenu();

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
        this.beginConnectionAdjustment(conn, e.clientY);
        return;
      }
    }

    const clickedNode = this.findNodeAtPosition(pos);
    const nodeClicked = !!clickedNode;

    if (clickedNode) {
      if (typeof clickedNode.onParameterClick === 'function') {
        const handled = clickedNode.onParameterClick(pos.x, pos.y, this);
        if (handled) return;
      }

      this.selectedNode = clickedNode;
      this.isDragging = true;
      this.dragOffset = { x: pos.x - clickedNode.x, y: pos.y - clickedNode.y };
      this.selectedConnection = null;

      this.showParameterPanel(clickedNode);
    }

    if (!nodeClicked) {
      this.hideParameterPanel();
      this.selectedConnection = null;
      this.isPanning = true;
      this.panStart = this.getCanvasPos(e);
      this.panStartOffset = { x: this.viewOffset.x, y: this.viewOffset.y };
      this.canvas.style.cursor = 'grabbing';
    }
  }

  onMouseMove(e) {
    const pos = this.getMousePos(e);
    this.mousePos = pos;

    if (this.isAdjustingKnob && this.adjustingKnob) {
      this.updateKnobAdjustment(pos.y);
      return;
    }

    if (this.isAdjustingConnection && this.adjustingConnection) {
      this.updateConnectionAdjustment(e.clientY);
      this.canvas.style.cursor = 'ns-resize';
      return;
    }

    if (this.isPanning) {
      const currentCanvasPos = this.getCanvasPos(e);
      this.viewOffset.x = this.panStartOffset.x + (currentCanvasPos.x - this.panStart.x);
      this.viewOffset.y = this.panStartOffset.y + (currentCanvasPos.y - this.panStart.y);
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    let cursorStyle = 'default';
    this.hoveredParamNode = null;
    this.hoveredConnection = null;

    for (const node of this.nodes) {
      if (node instanceof OperatorNode || node instanceof FilterNode) {
        const knob = node.getKnobAt(pos.x, pos.y);
        if (knob) {
          cursorStyle = 'pointer';
          this.hoveredParamNode = node;
          this.hoveredKnob = { node, paramName: knob.paramName };
          break;
        }
      }
    }

    if (cursorStyle === 'default') {
      for (let i = this.connections.length - 1; i >= 0; i--) {
        const conn = this.connections[i];
        if (this.isPointNearConnection(pos, conn)) {
          this.hoveredConnection = conn;
          cursorStyle = 'ns-resize';
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

    if (this.isAdjustingConnection) {
      this.isAdjustingConnection = false;
      this.adjustingConnection = null;
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
    this.isPanning = false;

    if (this.canvas.style.cursor === 'grabbing') {
      this.canvas.style.cursor = 'default';
    }
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

  onContextMenu(e) {
    e.preventDefault();

    const pos = this.getMousePos(e);
    const node = this.findNodeAtPosition(pos);

    if (!node) {
      const conn = this.findConnectionAtPosition(pos);
      if (!conn) {
        this.selectedConnection = null;
        this.selectedNode = null;
        this.showCanvasContextMenu(e.clientX, e.clientY, pos);
        return;
      }

      this.selectedConnection = conn;
      this.selectedNode = null;
      this.showConnectionContextMenu(e.clientX, e.clientY, conn);
      return;
    }

    this.selectedNode = node;
    this.selectedConnection = null;
    this.showParameterPanel(node);
    this.showNodeContextMenu(e.clientX, e.clientY, node);
  }

  onGlobalPointerDown(e) {
    if (this.contextMenuElement && this.contextMenuElement.contains(e.target)) {
      return;
    }

    this.hideContextMenu();
  }

  findNodeAtPosition(pos) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      if (
        pos.x >= node.x &&
        pos.x <= node.x + node.width &&
        pos.y >= node.y &&
        pos.y <= node.y + node.height
      ) {
        return node;
      }
    }

    return null;
  }

  findConnectionAtPosition(pos) {
    for (let i = this.connections.length - 1; i >= 0; i--) {
      const conn = this.connections[i];
      if (this.isPointNearConnection(pos, conn)) {
        return conn;
      }
    }

    return null;
  }

  showNodeContextMenu(clientX, clientY, node) {
    this.contextMenuNode = node;
    this.contextMenuConnection = null;
    this.contextMenuCanvasPosition = null;
    const isProtected = this.isNodeProtectedFromDeletion(node);

    this.showContextMenu(clientX, clientY, [
      {
        label: 'Delete node',
        color: '#ff7d7d',
        disabled: isProtected,
        onClick: () => {
          this.removeNode(node, true);
          this.hideContextMenu();
        }
      }
    ]);
  }

  showConnectionContextMenu(clientX, clientY, conn) {
    this.contextMenuNode = null;
    this.contextMenuConnection = conn;
    this.contextMenuCanvasPosition = null;

    this.showContextMenu(clientX, clientY, [
      {
        label: 'Delete connection',
        color: '#ff7d7d',
        onClick: () => {
          this.removeConnection(conn, true);
          this.hideContextMenu();
        }
      }
    ]);
  }

  showCanvasContextMenu(clientX, clientY, canvasPosition) {
    this.contextMenuNode = null;
    this.contextMenuConnection = null;
    this.contextMenuCanvasPosition = canvasPosition;

    this.showContextMenu(clientX, clientY, [
      {
        label: 'Add',
        onClick: () => this.showAddNodesContextMenu(clientX, clientY)
      }
    ]);
  }

  showAddNodesContextMenu(clientX, clientY) {
    const canvasPosition = this.contextMenuCanvasPosition
      ? { ...this.contextMenuCanvasPosition }
      : { x: 140, y: 120 };

    this.showContextMenu(clientX, clientY, [
      {
        label: 'Back',
        onClick: () => this.showCanvasContextMenu(clientX, clientY, canvasPosition)
      },
      {
        label: 'Add Operator',
        onClick: () => {
          this.requestCanvasNodeAdd('operator', canvasPosition);
          this.hideContextMenu();
        }
      },
      {
        label: 'Add Filter',
        onClick: () => {
          this.requestCanvasNodeAdd('filter', canvasPosition);
          this.hideContextMenu();
        }
      }
    ]);
  }

  requestCanvasNodeAdd(nodeType, canvasPosition) {
    if (typeof this.onCanvasAddNodeRequested === 'function') {
      this.onCanvasAddNodeRequested(nodeType, canvasPosition);
      return;
    }

    emitToBackend({
      type: 'ADD_NODE',
      nodeType,
      data: {
        position: {
          x: canvasPosition.x,
          y: canvasPosition.y
        }
      }
    });
  }

  ensureContextMenuElement() {
    if (this.contextMenuElement) {
      return;
    }

    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    menu.style.zIndex = '1000';
    menu.style.background = '#2a2a2a';
    menu.style.border = '1px solid #4a90e2';
    menu.style.borderRadius = '6px';
    menu.style.padding = '4px';
    menu.style.minWidth = '150px';
    menu.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
    menu.style.display = 'none';

    const list = document.createElement('div');
    menu.appendChild(list);
    document.body.appendChild(menu);

    this.contextMenuElement = menu;
    this.contextMenuListElement = list;
  }

  showContextMenu(clientX, clientY, items) {
    this.ensureContextMenuElement();

    this.contextMenuListElement.innerHTML = '';

    items.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.style.width = '100%';
      button.style.border = 'none';
      button.style.borderRadius = '4px';
      button.style.padding = '8px 10px';
      button.style.background = 'transparent';
      button.style.color = item.color || '#dde8f5';
      button.style.textAlign = 'left';
      button.style.cursor = item.disabled ? 'not-allowed' : 'pointer';
      button.style.opacity = item.disabled ? '0.45' : '1';
      button.textContent = item.label;
      button.disabled = !!item.disabled;

      button.addEventListener('mouseenter', () => {
        if (!button.disabled) {
          button.style.background = '#3a3a3a';
        }
      });

      button.addEventListener('mouseleave', () => {
        button.style.background = 'transparent';
      });

      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (button.disabled) {
          return;
        }

        if (typeof item.onClick === 'function') {
          item.onClick();
        }
      });

      this.contextMenuListElement.appendChild(button);
    });

    this.contextMenuElement.style.left = `${clientX}px`;
    this.contextMenuElement.style.top = `${clientY}px`;
    this.contextMenuElement.style.display = 'block';
  }

  hideContextMenu() {
    if (this.contextMenuElement) {
      this.contextMenuElement.style.display = 'none';
    }
    this.contextMenuNode = null;
    this.contextMenuConnection = null;
    this.contextMenuCanvasPosition = null;
  }

  isNodeProtectedFromDeletion(node) {
    return node && typeof node.title === 'string' && node.title.toLowerCase() === 'output';
  }

  removeNode(node, sendBackendUpdate = true) {
    if (!node || this.isNodeProtectedFromDeletion(node)) {
      return false;
    }

    const backendNodeId = node.backendId;

    this.connections = this.connections.filter((conn) => conn.fromNode !== node && conn.toNode !== node);
    this.nodes = this.nodes.filter((graphNode) => graphNode !== node);

    if (this.selectedNode === node) {
      this.selectedNode = null;
      this.hideParameterPanel();
    }

    if (
      this.selectedConnection
      && (this.selectedConnection.fromNode === node || this.selectedConnection.toNode === node)
    ) {
      this.selectedConnection = null;
    }

    if (this.hoveredParamNode === node) {
      this.hoveredParamNode = null;
      this.hoveredKnob = null;
    }

    if (this.adjustingKnob && this.adjustingKnob.node === node) {
      this.isAdjustingKnob = false;
      this.adjustingKnob = null;
    }

    if (sendBackendUpdate && backendNodeId !== null && backendNodeId !== undefined) {
      emitToBackend({
        type: 'REMOVE_NODE',
        data: {
          nodeId: backendNodeId
        }
      });
    }

    return true;
  }

  removeConnection(conn, sendBackendUpdate = true) {
    if (!conn) {
      return false;
    }

    this.connections = this.connections.filter((candidate) => candidate !== conn);

    if (this.selectedConnection === conn) {
      this.selectedConnection = null;
      this.hideParameterPanel();
    }

    if (this.hoveredConnection === conn) {
      this.hoveredConnection = null;
    }

    if (sendBackendUpdate) {
      emitToBackend({
        type: 'REMOVE_CONNECTION',
        data: {
          sourceNodeId: conn.fromNode.backendId,
          destNodeId: conn.toNode.backendId,
          connectionType: conn.connectionType || this.inferConnectionType(conn.fromNode, conn.toNode)
        }
      });
    }

    return true;
  }

  isPointNearConnection(point, conn) {
    const start = conn.fromNode.getOutputPortPosition(conn.fromPort);
    const end = conn.toNode.getInputPortPosition(conn.toPort);

    const threshold = 10 / this.viewScale;
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
    const connectionType = this.inferConnectionType(fromNode, toNode);
    const connection = {
      fromNode,
      fromPort,
      toNode,
      toPort,
      amount: connectionType === 'gain' ? 1.0 : 1.0,
      connectionType
    };
    this.connections.push(connection);

    emitToBackend({
      type: 'ADD_CONNECTION',
      data: {
        sourceNodeId: fromNode.backendId,
        destNodeId: toNode.backendId,
        amount: connection.amount,
        connectionType: connection.connectionType
      }
    });
  }

  inferConnectionType(fromNode, toNode) {
    const toType = ((toNode && toNode.nodeType) || '').toLowerCase();

    if (toType === 'operator' || toType === 'oscillator') {
      return 'modulation';
    }

    return 'gain';
  }

  addNode(node) {
    this.nodes.push(node);
  }

  findNodeByBackendId(backendId) {
    return this.nodes.find((node) => node.backendId === backendId) || null;
  }

  addConnectionFromBackend(sourceNodeId, destNodeId, amount, connectionType = null) {
    const fromNode = this.findNodeByBackendId(sourceNodeId);
    const toNode = this.findNodeByBackendId(destNodeId);

    if (!fromNode || !toNode) {
      return false;
    }

    const resolvedType = connectionType || this.inferConnectionType(fromNode, toNode);

    this.connections.push({
      fromNode,
      fromPort: 0,
      toNode,
      toPort: 0,
      amount,
      connectionType: resolvedType
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
      } else if (nodeType === 'filter') {
        node = this.createFilterNode(280, 120 + defaultOperatorRow * 90);
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
        connectionData.amount ?? 1.0,
        connectionData.connectionType || null
      );
    });

    this.syncAllNodePositions(true);
  }

  assignBackendNodeData(node, nodeData) {
    node.backendId = nodeData.id;
    node.nodeType = (nodeData.type || '').toLowerCase();

    const params = nodeData.data || {};
    if (node instanceof OperatorNode) {
      if (params.frequencyRatio !== undefined) node.frequencyRatio = parseFloat(params.frequencyRatio);
      if (params.amplitude !== undefined) node.amplitude = parseFloat(params.amplitude);
      if (params.attack !== undefined) node.attack = parseFloat(params.attack);
      if (params.decay !== undefined) node.decay = parseFloat(params.decay);
      if (params.sustain !== undefined) node.sustain = parseFloat(params.sustain);
      if (params.release !== undefined) node.release = parseFloat(params.release);
      node.ratio = node.frequencyRatio;
    } else if (node instanceof FilterNode) {
      if (params.cutoff !== undefined) node.cutoff = parseFloat(params.cutoff);
      if (params.resonance !== undefined) node.resonance = parseFloat(params.resonance);
      if (params.envAmount !== undefined) node.envAmount = parseFloat(params.envAmount);
      if (params.attack !== undefined) node.attack = parseFloat(params.attack);
      if (params.decay !== undefined) node.decay = parseFloat(params.decay);
      if (params.sustain !== undefined) node.sustain = parseFloat(params.sustain);
      if (params.release !== undefined) node.release = parseFloat(params.release);

      const filterType = (params.filterType || '').toLowerCase();
      if (filterType === 'highpass' || filterType === 'hp') {
        node.filterType = 2;
      } else if (filterType === 'bandpass' || filterType === 'bp') {
        node.filterType = 1;
      } else {
        node.filterType = 0;
      }

      const slope = String(params.slope || '').toLowerCase();
      node.slope = (slope === '24db' || slope === '24' || slope === '1') ? 1 : 0;
    }
  }

  createOperatorNode(x, y) {
    return new OperatorNode(x, y);
  }

  createFilterNode(x, y) {
    return new FilterNode(x, y);
  }

  createOutputNode(x, y) {
    throw new Error('createOutputNode must be provided by subclass or composition');
  }

  render() {
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawGrid();

    this.ctx.save();
    this.ctx.setTransform(
      this.viewScale,
      0,
      0,
      this.viewScale,
      this.viewOffset.x,
      this.viewOffset.y
    );

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
      if (node instanceof OperatorNode || node instanceof FilterNode) {
        const hoveredKnobName = this.hoveredKnob && this.hoveredKnob.node === node
          ? this.hoveredKnob.paramName
          : null;
        node.draw(this.ctx, hoveredKnobName);
      } else {
        node.draw(this.ctx);
      }

      if (this.selectedNode === node) {
        this.drawSelectedNodeHighlight(node);
      }
    });

    this.ctx.restore();
  }

  drawSelectedNodeHighlight(node) {
    const padding = 3;

    this.ctx.save();
    this.ctx.strokeStyle = '#ffb347';
    this.ctx.lineWidth = 3;
    this.ctx.shadowColor = 'rgba(255, 179, 71, 0.55)';
    this.ctx.shadowBlur = 12;
    this.ctx.strokeRect(
      node.x - padding,
      node.y - padding,
      node.width + padding * 2,
      node.height + padding * 2
    );
    this.ctx.restore();
  }

  drawConnection(conn) {
    const start = conn.fromNode.getOutputPortPosition(conn.fromPort);
    const end = conn.toNode.getInputPortPosition(conn.toPort);

    const isSelected = this.selectedConnection === conn;
    const strength = this.getConnectionStrength(conn);
    const isHovered = this.hoveredConnection === conn;
    const color = this.getConnectionColor(conn, strength, isSelected || isHovered);
    const baseWidth = 1.5 + strength * 3.5;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = isSelected ? baseWidth + 1 : baseWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(start.x, start.y);

    const cpOffset = Math.abs(end.x - start.x) / 2;
    this.ctx.bezierCurveTo(
      start.x + cpOffset, start.y,
      end.x - cpOffset, end.y,
      end.x, end.y
    );
    this.ctx.stroke();

    if (isSelected || isHovered) {
      const midX = (start.x + end.x) * 0.5;
      const midY = (start.y + end.y) * 0.5 - 6;
      this.ctx.fillStyle = '#d5ebff';
      this.ctx.font = '11px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(this.formatConnectionValue(conn), midX, midY);
    }
  }

  getConnectionRange(conn) {
    const connectionType = conn.connectionType || this.inferConnectionType(conn.fromNode, conn.toNode);
    if (connectionType === 'gain') {
      return {
        min: 0,
        max: 2,
        sensitivity: 220
      };
    }

    return {
      min: 0,
      max: 20,
      sensitivity: 260
    };
  }

  beginConnectionAdjustment(conn, mouseClientY) {
    const range = this.getConnectionRange(conn);
    this.isAdjustingConnection = true;
    this.adjustingConnection = {
      connection: conn,
      startY: mouseClientY,
      startAmount: Number.isFinite(conn.amount) ? conn.amount : 0,
      min: range.min,
      max: range.max,
      sensitivity: range.sensitivity
    };
  }

  updateConnectionAdjustment(mouseClientY) {
    if (!this.adjustingConnection) {
      return;
    }

    const state = this.adjustingConnection;
    const delta = state.startY - mouseClientY;
    const range = state.max - state.min;
    const normalizedDelta = (delta / state.sensitivity) * range;
    const newAmount = Math.max(
      state.min,
      Math.min(state.max, state.startAmount + normalizedDelta)
    );

    const conn = state.connection;
    conn.amount = newAmount;

    emitToBackend({
      type: 'UPDATE_CONNECTION',
      data: {
        sourceNodeId: conn.fromNode.backendId,
        destNodeId: conn.toNode.backendId,
        amount: conn.amount,
        connectionType: conn.connectionType || this.inferConnectionType(conn.fromNode, conn.toNode)
      }
    });
  }

  getConnectionStrength(conn) {
    const connectionType = conn.connectionType || this.inferConnectionType(conn.fromNode, conn.toNode);
    const amount = Number.isFinite(conn.amount) ? conn.amount : 0;

    if (connectionType === 'gain') {
      return Math.max(0, Math.min(1, amount / 2));
    }

    return Math.max(0, Math.min(1, amount / 20));
  }

  getConnectionColor(conn, strength, emphasized = false) {
    const connectionType = conn.connectionType || this.inferConnectionType(conn.fromNode, conn.toNode);
    const alpha = emphasized ? 0.95 : (0.35 + strength * 0.55);

    if (connectionType === 'gain') {
      const r = Math.round(80 + strength * 80);
      const g = Math.round(190 + strength * 50);
      const b = Math.round(120 + strength * 55);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    const r = Math.round(74 + strength * 110);
    const g = Math.round(144 + strength * 70);
    const b = Math.round(226 + strength * 20);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  formatConnectionValue(conn) {
    const connectionType = conn.connectionType || this.inferConnectionType(conn.fromNode, conn.toNode);
    const amount = Number.isFinite(conn.amount) ? conn.amount : 0;
    if (connectionType === 'gain') {
      return `gain ${amount.toFixed(2)}`;
    }

    return `idx ${amount.toFixed(2)}`;
  }

  drawGrid() {
    const gridSize = 40;
    const scaledGrid = gridSize * this.viewScale;
    if (scaledGrid < 8) {
      return;
    }

    this.ctx.strokeStyle = '#2a2a2a';
    this.ctx.lineWidth = 1;

    const startX = ((this.viewOffset.x % scaledGrid) + scaledGrid) % scaledGrid;
    const startY = ((this.viewOffset.y % scaledGrid) + scaledGrid) % scaledGrid;

    for (let x = startX; x < this.canvas.width; x += scaledGrid) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }

    for (let y = startY; y < this.canvas.height; y += scaledGrid) {
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

    panel.style.display = 'block';
    title.textContent = `${node.title} (ID: ${node.backendId})`;
    controls.innerHTML = '';
    this.applyParameterPanelState();

    if (node instanceof OperatorNode || node instanceof FilterNode) {
      panel.classList.add('adsr-compact');
      this.adsrPanel.render(controls, node);

      if (node instanceof FilterNode) {
        this.createNodeModeControl(controls, node);
        this.createFilterSlopeControl(controls, node);
      }
    } else {
      panel.classList.remove('adsr-compact');
    }
  }

  createNodeModeControl(container, node) {
    const wrapper = document.createElement('div');
    wrapper.className = 'param-control';

    const label = document.createElement('label');
    label.textContent = 'Filter Mode';

    const select = document.createElement('select');
    select.style.width = '100%';
    select.style.padding = '6px 8px';
    select.style.marginTop = '6px';
    select.style.background = '#18202b';
    select.style.color = '#d4e4f4';
    select.style.border = '1px solid #32465d';
    select.style.borderRadius = '4px';

    const modes = [
      { label: 'Lowpass', value: 0 },
      { label: 'Bandpass', value: 1 },
      { label: 'Highpass', value: 2 }
    ];

    for (const mode of modes) {
      const option = document.createElement('option');
      option.textContent = mode.label;
      option.value = String(mode.value);
      select.appendChild(option);
    }

    const currentMode = Number.isFinite(node.filterType) ? node.filterType : 0;
    select.value = String(Math.max(0, Math.min(2, Math.round(currentMode))));

    select.addEventListener('change', () => {
      const nextMode = parseInt(select.value, 10);
      node.filterType = Number.isFinite(nextMode) ? nextMode : 0;
      this.emitNodeParameterUpdate(node, 'filterType', node.filterType);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    container.appendChild(wrapper);
  }

  createFilterSlopeControl(container, node) {
    const wrapper = document.createElement('div');
    wrapper.className = 'param-control';

    const label = document.createElement('label');
    label.textContent = 'Filter Slope';

    const select = document.createElement('select');
    select.style.width = '100%';
    select.style.padding = '6px 8px';
    select.style.marginTop = '6px';
    select.style.background = '#18202b';
    select.style.color = '#d4e4f4';
    select.style.border = '1px solid #32465d';
    select.style.borderRadius = '4px';

    const slopes = [
      { label: '12 dB / Oct', value: 0 },
      { label: '24 dB / Oct', value: 1 }
    ];

    for (const slope of slopes) {
      const option = document.createElement('option');
      option.textContent = slope.label;
      option.value = String(slope.value);
      select.appendChild(option);
    }

    const currentSlope = Number.isFinite(node.slope) ? node.slope : 0;
    select.value = String(Math.max(0, Math.min(1, Math.round(currentSlope))));

    select.addEventListener('change', () => {
      const nextSlope = parseInt(select.value, 10);
      node.slope = Number.isFinite(nextSlope) ? nextSlope : 0;
      this.emitNodeParameterUpdate(node, 'slope', node.slope);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    container.appendChild(wrapper);
  }

  showConnectionPanel(conn) {
    const panel = document.getElementById('paramPanel');
    const title = document.getElementById('paramTitle');
    const controls = document.getElementById('paramControls');

    panel.classList.remove('adsr-compact');

    const connectionType = conn.connectionType || this.inferConnectionType(conn.fromNode, conn.toNode);
    const isGainConnection = connectionType === 'gain';
    const label = isGainConnection ? 'Gain' : 'Modulation Index';
    const min = isGainConnection ? 0 : 0;
    const max = isGainConnection ? 2 : 20;
    const step = isGainConnection ? 0.01 : 0.1;

    title.textContent = `Connection: ${conn.fromNode.title} -> ${conn.toNode.title} (${connectionType})`;
    controls.innerHTML = '';

    this.createConnectionControl(controls, label, 'amount', conn.amount, min, max, step, conn);

    panel.style.display = 'block';
    this.applyParameterPanelState();
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
          amount: parsed,
          connectionType: conn.connectionType || this.inferConnectionType(conn.fromNode, conn.toNode)
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
