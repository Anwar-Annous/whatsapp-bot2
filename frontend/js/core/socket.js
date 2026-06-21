const socket = io();
let currentWorkspace = 1;

export function getSocket() {
  return socket;
}

export function setWorkspace(id) {
  if (currentWorkspace === id) return;
  socket.emit('leave_workspace', currentWorkspace);
  currentWorkspace = id;
  socket.emit('join_workspace', id);
}

export function init() {
  socket.on('connect', () => {
    socket.emit('join_workspace', currentWorkspace);
  });

  socket.on('disconnect', () => {
    console.warn('Socket disconnected');
  });
}

export function on(event, callback) {
  socket.on(event, callback);
}

export function off(event, callback) {
  socket.off(event, callback);
}

export function emit(event, data) {
  socket.emit(event, data);
}
