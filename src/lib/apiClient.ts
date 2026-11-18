import { auth } from './firebase';

function createIdempotencyKey(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `jerry-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? 'GET').toUpperCase();
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
  return fetch(input, { ...init, headers });
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
