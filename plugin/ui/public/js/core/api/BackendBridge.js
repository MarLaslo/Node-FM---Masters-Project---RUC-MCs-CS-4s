import { hasBackend, emitToBackend, parseBackendEvent } from './backendApi.js';

export class BackendBridge {
  constructor(graph) {
    this.graph = graph;
    this.pendingOperatorPositions = [];
    this.pendingFilterPositions = [];
  }

  initializeInfo() {
    if (!(window.__JUCE__ && window.__JUCE__.initialisationData)) {
      return;
    }

    const data = window.__JUCE__.initialisationData;
    const infoElement = document.getElementById('info');
    if (infoElement) {
      infoElement.innerHTML = data.info || 'NodeFM Synth';
    }
  }

  setup() {
    if (!hasBackend()) {
      console.warn('JUCE backend not available!');
      return;
    }

    this.registerNodeAdded();
    this.registerNodeRemoved();
    this.registerConnectionAdded();
    this.registerConnectionRemoved();
    this.registerGraphStateSync();
    this.registerGraphCleared();
    this.registerSpectrumUpdate();
    this.registerNodeParameterUpdated();
    this.registerOutputGainSync();

    emitToBackend({ type: 'UI_READY' });
  }

  registerNodeAdded() {
    window.__JUCE__.backend.addEventListener('NODE_ADDED', (event) => {
      try {
        const data = parseBackendEvent(event);
        const nodeData = data.data || data;

        let node = null;
        if (nodeData.type === 'output') {
          node = this.graph.createOutputNode(420, 100);
        } else if (nodeData.type === 'operator' || nodeData.type === 'oscillator') {
          node = this.graph.createOperatorNode(140, 100);
        } else if (nodeData.type === 'filter') {
          node = this.graph.createFilterNode(280, 100);
        }

        if (!node) {
          return;
        }

        this.graph.assignBackendNodeData(node, nodeData);

        if (nodeData.type === 'operator' || nodeData.type === 'oscillator') {
          const backendPosition = nodeData.position || null;
          if (backendPosition && Number.isFinite(backendPosition.x) && Number.isFinite(backendPosition.y)) {
            node.x = backendPosition.x;
            node.y = backendPosition.y;
          }

          const pendingPosition = this.pendingOperatorPositions.shift();
          if (!backendPosition && pendingPosition) {
            node.x = pendingPosition.x;
            node.y = pendingPosition.y;
          }
        } else if (nodeData.type === 'filter') {
          const backendPosition = nodeData.position || null;
          if (backendPosition && Number.isFinite(backendPosition.x) && Number.isFinite(backendPosition.y)) {
            node.x = backendPosition.x;
            node.y = backendPosition.y;
          }

          const pendingPosition = this.pendingFilterPositions.shift();
          if (!backendPosition && pendingPosition) {
            node.x = pendingPosition.x;
            node.y = pendingPosition.y;
          }
        }

        this.graph.addNode(node);
        this.graph.syncNodePosition(node, true);
      } catch (error) {
        console.error('Error handling NODE_ADDED:', error);
      }
    });
  }

  registerConnectionAdded() {
    window.__JUCE__.backend.addEventListener('CONNECTION_ADDED', (event) => {
      try {
        const data = parseBackendEvent(event);
        const connectionData = data.data || data;

        this.graph.addConnectionFromBackend(
          connectionData.sourceNodeId,
          connectionData.destNodeId,
          connectionData.amount ?? 1.0,
          connectionData.connectionType || null
        );
      } catch (error) {
        console.error('Error handling CONNECTION_ADDED:', error);
      }
    });
  }

  registerConnectionRemoved() {
    window.__JUCE__.backend.addEventListener('CONNECTION_REMOVED', (event) => {
      try {
        const payload = parseBackendEvent(event);
        const data = payload.data || payload;
        const sourceNodeId = parseInt(data.sourceNodeId, 10);
        const destNodeId = parseInt(data.destNodeId, 10);
        const connectionType = data.connectionType || null;

        if (!Number.isFinite(sourceNodeId) || !Number.isFinite(destNodeId)) {
          return;
        }

        const conn = this.graph.connections.find((candidate) => {
          if (!candidate || !candidate.fromNode || !candidate.toNode) {
            return false;
          }

          const sameEndpoints = candidate.fromNode.backendId === sourceNodeId
            && candidate.toNode.backendId === destNodeId;
          if (!sameEndpoints) {
            return false;
          }

          if (!connectionType) {
            return true;
          }

          const currentType = candidate.connectionType || this.graph.inferConnectionType(candidate.fromNode, candidate.toNode);
          return currentType === connectionType;
        });

        if (conn) {
          this.graph.removeConnection(conn, false);
        }
      } catch (error) {
        console.error('Error handling CONNECTION_REMOVED:', error);
      }
    });
  }

  registerNodeRemoved() {
    window.__JUCE__.backend.addEventListener('NODE_REMOVED', (event) => {
      try {
        const payload = parseBackendEvent(event);
        const data = payload.data || payload;
        const nodeId = parseInt(data.nodeId, 10);
        if (!Number.isFinite(nodeId)) {
          return;
        }

        const node = this.graph.findNodeByBackendId(nodeId);
        if (node) {
          this.graph.removeNode(node, false);
        }
      } catch (error) {
        console.error('Error handling NODE_REMOVED:', error);
      }
    });
  }

  registerGraphStateSync() {
    window.__JUCE__.backend.addEventListener('GRAPH_STATE_SYNC', (event) => {
      try {
        const payload = parseBackendEvent(event);
        const graphState = payload.data || payload;
        this.graph.applyGraphState(graphState);
      } catch (error) {
        console.error('Error handling GRAPH_STATE_SYNC:', error);
      }
    });
  }

  registerGraphCleared() {
    window.__JUCE__.backend.addEventListener('GRAPH_CLEARED', () => {
      console.log('Backend graph cleared; waiting for default node sync events.');
    });
  }

  registerSpectrumUpdate() {
    window.__JUCE__.backend.addEventListener('SPECTRUM_UPDATE', (event) => {
      try {
        const payload = parseBackendEvent(event);
        const bins = payload.data || payload;
        if (!Array.isArray(bins)) {
          return;
        }

        for (const node of this.graph.nodes) {
          if (node && node.nodeType === 'output' && typeof node.setSpectrum === 'function') {
            node.setSpectrum(bins);
          }
        }
      } catch (error) {
        console.error('Error handling SPECTRUM_UPDATE:', error);
      }
    });
  }

  registerNodeParameterUpdated() {
    window.__JUCE__.backend.addEventListener('NODE_PARAMETER_UPDATED', (event) => {
      try {
        const payload = parseBackendEvent(event);
        const data = payload.data || payload;
        const nodeId = parseInt(data.nodeId, 10);
        const paramName = (data.paramName || '').toString();
        const value = Number(data.value);

        if (!Number.isFinite(nodeId) || !paramName || !Number.isFinite(value)) {
          return;
        }

        const node = this.graph.findNodeByBackendId(nodeId);
        if (!node) {
          return;
        }

        node[paramName] = value;
        if (paramName === 'frequencyRatio') {
          node.ratio = value;
        }
      } catch (error) {
        console.error('Error handling NODE_PARAMETER_UPDATED:', error);
      }
    });
  }

  registerOutputGainSync() {
    window.__JUCE__.backend.addEventListener('OUTPUT_GAIN_SYNC', (event) => {
      try {
        const payload = parseBackendEvent(event);
        const data = payload.data ?? payload;
        const gain = Number(data);
        if (!Number.isFinite(gain)) {
          return;
        }

        const slider = document.getElementById('outputGainSlider');
        if (!slider) {
          return;
        }

        const clamped = Math.min(1, Math.max(0, gain));
        slider.value = clamped.toString();
      } catch (error) {
        console.error('Error handling OUTPUT_GAIN_SYNC:', error);
      }
    });
  }

  requestAddOperator(position = null) {
    const hasValidPosition = !!(
      position
      && Number.isFinite(position.x)
      && Number.isFinite(position.y)
    );

    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      this.pendingOperatorPositions.push({ x: position.x, y: position.y });
    }

    const data = {
      frequencyRatio: 1.0,
      amplitude: 0.5,
      velocityAmount: 1.0,
      attack: 0.01,
      decay: 0.1,
      sustain: 0.7,
      release: 0.3,
      pitchEnvAmount: 0.0,
      pitchAttack: 0.01,
      pitchDecay: 0.1,
      pitchSustain: 0.7,
      pitchRelease: 0.3
    };

    if (hasValidPosition) {
      data.position = { x: position.x, y: position.y };
    }

    emitToBackend({
      type: 'ADD_NODE',
      nodeType: 'operator',
      data
    });
  }

  requestAddFilter(position = null) {
    const hasValidPosition = !!(
      position
      && Number.isFinite(position.x)
      && Number.isFinite(position.y)
    );

    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      this.pendingFilterPositions.push({ x: position.x, y: position.y });
    }

    const data = {
      cutoff: 1200,
      resonance: 0.707,
      envAmount: 2000,
      filterType: 'lowpass',
      filterCurve: '12db',
      attack: 0.01,
      decay: 0.1,
      sustain: 0.7,
      release: 0.3
    };

    if (hasValidPosition) {
      data.position = { x: position.x, y: position.y };
    }

    emitToBackend({
      type: 'ADD_NODE',
      nodeType: 'filter',
      data
    });
  }

  requestOutputGainChange(gain) {
    emitToBackend({
      type: 'UPDATE_OUTPUT_GAIN',
      data: { gain }
    });
  }
}
