// All server calls go through here. The backend answers { success, data } or { success: false, error }.
const BASE = import.meta.env.VITE_API_URL || '/api';

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the backend. Is it running on port 5000?');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(json.error || 'Request failed');
  return json.data !== undefined ? json.data : json;
}
