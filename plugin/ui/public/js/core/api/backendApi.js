export function hasBackend() {
  return !!(window.__JUCE__ && window.__JUCE__.backend);
}

export function emitToBackend(payload) {
  if (!hasBackend()) {
    return false;
  }

  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  window.__JUCE__.backend.emitEvent('messageFromJS', message);
  return true;
}

export function parseBackendEvent(event) {
  return typeof event === 'string' ? JSON.parse(event) : event;
}
