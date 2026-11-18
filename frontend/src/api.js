const BASE = import.meta.env.VITE_API_URL || '/api';

export async function api(path, { method = 'GET', body, params } = {}) {
  const token = localStorage.getItem('ab_token');
  let url = BASE + path;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    if (qs) url += `?${qs}`;
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(navigator.onLine ? 'Server not reachable. Please try again.' : 'You are offline.');
  }

  if (res.status === 401 && path !== '/auth/login') {
    localStorage.removeItem('ab_token');
    window.dispatchEvent(new Event('auth:logout'));
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') msg = j.detail;
      else if (Array.isArray(j.detail) && j.detail[0]) {
        const d = j.detail[0];
        msg = `${d.loc?.slice(-1)[0] ?? 'Field'}: ${d.msg}`;
      }
    } catch { /* non-JSON error */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}
