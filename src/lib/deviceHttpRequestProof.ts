/**
 * Canonical device proof for one exact encrypted-memory HTTP operation.
 * Challenge persistence/consumption remains a server transaction responsibility.
 */
export interface DeviceHttpRequestChallenge {
  challengeId: string;
  nonce: string;
  ownerUid: string;
  deviceId: string;
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  bodySha256: string;
  expiresAt: string;
}
export interface DeviceHttpSigningPublicKey {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}
export interface DeviceHttpRequestProof {
  challengeId: string;
  signature: string;
}

const encoder = new TextEncoder();
const CHALLENGE_TTL_MS = 60_000;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}
function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{86}$/.test(value)) throw new Error('Device request proof encoding is invalid.');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

/** Only encrypted-memory operations and the owner-authorized device-revocation command are signable. */
export function isAllowedEncryptedMemoryTarget(method: string, path: string): boolean {
  if (typeof path !== 'string' || path.includes('?') || path.includes('#') ||
      path.includes('\\') || path.includes('%') || path.includes('//') ||
      path.split('/').some((part) => part === '.' || part === '..')) return false;
  if (path === '/api/memory/encrypted') return method === 'GET' || method === 'POST';
  if (/^\/api\/memory\/encrypted\/page\/(?:start|[A-Za-z0-9_-]{8,768})$/.test(path)) return method === 'GET';
  if (path === '/api/memory/rotation-snapshots') return method === 'POST';
  if (/^\/api\/memory\/rotation-snapshots\/[0-9a-f-]{36}\/\d{1,6}$/i.test(path)) return method === 'GET';
  if (/^\/api\/devices\/[A-Za-z0-9_-]{16,128}\/revoke$/.test(path)) return method === 'POST';
  if (path === '/api/memory/key-envelopes') return method === 'POST';
  if (/^\/api\/memory\/key-envelopes\/[1-9][0-9]{0,8}$/.test(path)) return method === 'GET';
  return /^\/api\/memory\/encrypted\/[A-Za-z0-9_-]{16,128}$/.test(path) &&
    (method === 'PUT' || method === 'GET');
}

function validateChallenge(challenge: DeviceHttpRequestChallenge, now: number): void {
  if (!challenge || !/^[A-Za-z0-9_-]{16,128}$/.test(challenge.challengeId) ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(challenge.nonce) ||
      typeof challenge.ownerUid !== 'string' || !challenge.ownerUid.trim() || challenge.ownerUid.length > 160 ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(challenge.deviceId) ||
      !isAllowedEncryptedMemoryTarget(challenge.method, challenge.path) ||
      !/^[A-Za-z0-9_-]{43}$/.test(challenge.bodySha256) ||
      typeof challenge.expiresAt !== 'string') {
    throw new Error('Device request challenge is invalid.');
  }
  const expiry = Date.parse(challenge.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now || expiry > now + CHALLENGE_TTL_MS + 5_000) {
    throw new Error('Device request challenge is expired or exceeds its allowed lifetime.');
  }
}

export function canonicalDeviceHttpChallenge(
  challenge: DeviceHttpRequestChallenge,
  now = Date.now(),
): Uint8Array {
  validateChallenge(challenge, now);
  return encoder.encode(JSON.stringify({
    purpose: 'jerry-device-http-v1',
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    ownerUid: challenge.ownerUid,
    deviceId: challenge.deviceId,
    method: challenge.method,
    path: challenge.path,
    bodySha256: challenge.bodySha256,
    expiresAt: new Date(challenge.expiresAt).toISOString(),
  }));
}

export async function digestDeviceHttpBody(
  body: Uint8Array,
  cryptoProvider: Crypto = globalThis.crypto,
): Promise<string> {
  return base64Url(new Uint8Array(await cryptoProvider.subtle.digest('SHA-256', toArrayBuffer(body))));
}

export async function verifyDeviceHttpRequestProof(
  challenge: DeviceHttpRequestChallenge,
  proof: DeviceHttpRequestProof,
  publicKey: DeviceHttpSigningPublicKey,
  actualBody: Uint8Array,
  now = Date.now(),
  cryptoProvider: Crypto = globalThis.crypto,
): Promise<boolean> {
  try {
    if (!proof || proof.challengeId !== challenge.challengeId ||
        !publicKey || publicKey.kty !== 'EC' || publicKey.crv !== 'P-256' ||
        !/^[A-Za-z0-9_-]{43}$/.test(publicKey.x) ||
        !/^[A-Za-z0-9_-]{43}$/.test(publicKey.y) ||
        'd' in (publicKey as unknown as Record<string, unknown>)) return false;
    validateChallenge(challenge, now);
    if (await digestDeviceHttpBody(actualBody, cryptoProvider) !== challenge.bodySha256) return false;
    const key = await cryptoProvider.subtle.importKey(
      'jwk', publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
    const signature = fromBase64Url(proof.signature);
    if (signature.byteLength !== 64) return false;
    return await cryptoProvider.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key, toArrayBuffer(signature),
      toArrayBuffer(canonicalDeviceHttpChallenge(challenge, now)),
    );
  } catch {
    return false;
  }
}
