const listeners = {};
const state = {
  currentWorkspace: 1,
  user: null,
  section: 'inbox',
  workspaces: [],
  conversations: [],
  contacts: [],
  media: [],
  automation: null,
  logs: [],
  metrics: {},
  sessionStatus: { state: 'disconnected' },
  selectedConversationId: null
};

export function subscribe(event, callback) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(callback);
  return () => {
    listeners[event] = listeners[event].filter(cb => cb !== callback);
  };
}

export function emit(event, data) {
  if (listeners[event]) {
    listeners[event].forEach(cb => cb(data));
  }
}

export function setState(key, value) {
  const oldValue = state[key];
  state[key] = value;
  emit(`state:${key}`, value, oldValue);
  emit('stateChange', { key, value, oldValue });
}

export function getState(key) {
  return state[key];
}

export function getAllState() {
  return { ...state };
}

export function updateState(partial) {
  Object.entries(partial).forEach(([key, value]) => {
    setState(key, value);
  });
}
