import { auth } from './firebase';
import { mergeRequestHeaders } from './apiRequestHeaders';

const API_BASE = (() => {
  const configured = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
  if (!configured) return '';
  const parsed = new URL(configured);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('VITE_API_BASE_URL must be a clean HTTPS origin.');
  }
  return parsed.origin;
})();

const API_BASE_IS_PLACEHOLDER = API_BASE !== '' && new URL(API_BASE).hostname.endsWith('.invalid');

function resolveApiInput(input: RequestInfo | URL): RequestInfo | URL {
  if (!API_BASE && typeof window !== 'undefined' && window.location.origin === 'https://localhost') {
    throw new Error('Jerry backend is not connected. Configure a verified HTTPS JERRY_BACKEND_ORIGIN and rebuild the Android app.');
  }
  if (!API_BASE) return input;
  const raw = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  if (!raw.startsWith('/api/')) return input;
  if (API_BASE_IS_PLACEHOLDER) {
    throw new Error('Jerry backend is not connected. Configure a verified HTTPS JERRY_BACKEND_ORIGIN and rebuild the Android app.');
  }
  if (!API_BASE) return input;
  return `${API_BASE}${raw}`;
}

function createIdempotencyKey(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `jerry-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = mergeRequestHeaders(input, init.headers);
  const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const user = auth.currentUser;
  if (user && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  }
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && !headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', createIdempotencyKey());
  }
  if (init.body && !headers.has('Content-Type') && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(resolveApiInput(input), { ...init, headers });
}

export async function apiJson<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(input, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

/**
 * Checks the backend's public, non-diagnostic readiness endpoint. Android's
 * local WebView must never mistake its asset origin for a connected backend.
 */
export async function checkBackendReadiness(): Promise<boolean> {
  if (API_BASE_IS_PLACEHOLDER) return false;
  if (typeof window === 'undefined') return false;
  if (!API_BASE && window.location.origin === 'https://localhost') return false;
  const target = API_BASE ? `${API_BASE}/readyz` : '/readyz';
  try {
    const response = await fetch(target, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return false;
    const payload: unknown = await response.json();
    return !!payload && typeof payload === 'object' &&
      (payload as { status?: unknown }).status === 'ready';
  } catch {
    return false;
  }
}
