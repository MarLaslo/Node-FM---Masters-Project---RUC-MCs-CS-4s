import { hasBackend, emitToBackend, parseBackendEvent } from './backendApi.js';

export class BackendBridge {
  constructor(graph) {
    this.graph = graph;
    this.pendingOperatorPositions = [];
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
    this.registerConnectionAdded();
    this.registerGraphStateSync();
    this.registerGraphCleared();

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
          connectionData.amount ?? 1.0
        );
      } catch (error) {
        console.error('Error handling CONNECTION_ADDED:', error);
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
      nodeType: 'operator',
      data
    });
  }
}
