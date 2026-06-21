const BASE_URL = '';
const HEADERS = { 'Content-Type': 'application/json' };

export function getWorkspaceId() {
  return localStorage.getItem('workspaceId') || '1';
}

export function setWorkspaceId(id) {
  localStorage.setItem('workspaceId', String(id));
}

export async function api(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    ...HEADERS,
    ...options.headers,
    'X-Workspace-Id': getWorkspaceId()
  };
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

export function get(path) {
  return api(path, { method: 'GET' });
}

export function post(path, body) {
  return api(path, { method: 'POST', body });
}

export function put(path, body) {
  return api(path, { method: 'PUT', body });
}

export function del(path) {
  return api(path, { method: 'DELETE' });
}
