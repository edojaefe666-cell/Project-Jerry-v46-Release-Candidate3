/**
 * Separate ECDSA identity keys and challenge signatures for approving a new
 * Jerry device. These keys are distinct from the ECDH memory-envelope keys.
 * This module does not authorize a device by itself: the server must issue,
 * bind, expire, rate-limit, and atomically consume each challenge.
 */
export interface DeviceSigningPublicKey {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
  ext?: boolean;
  key_ops?: string[];
}

export interface DeviceApprovalChallenge {
  challengeId: string;
  nonce: string;
  ownerUid: string;
  approverDeviceId: string;
  targetRegistrationId: string;
  expiresAt: string;
}

export interface DeviceApprovalProof {
  challengeId: string;
  signature: string;
}

const encoder = new TextEncoder();

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43,2048}$/.test(value)) {
    throw new Error('Device approval proof encoding is invalid.');
  }
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function canonicalChallenge(challenge: DeviceApprovalChallenge): Uint8Array {
  if (!challenge || typeof challenge.challengeId !== 'string' ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(challenge.challengeId) ||
      typeof challenge.nonce !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(challenge.nonce) ||
      typeof challenge.ownerUid !== 'string' || !challenge.ownerUid.trim() || challenge.ownerUid.length > 160 ||
      typeof challenge.approverDeviceId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(challenge.approverDeviceId) ||
      typeof challenge.targetRegistrationId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(challenge.targetRegistrationId) ||
      typeof challenge.expiresAt !== 'string' || !Number.isFinite(Date.parse(challenge.expiresAt))) {
    throw new Error('Device approval challenge is invalid.');
  }
  return encoder.encode(JSON.stringify({
    purpose: 'jerry-device-approval-v1',
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    ownerUid: challenge.ownerUid,
    approverDeviceId: challenge.approverDeviceId,
    targetRegistrationId: challenge.targetRegistrationId,
    expiresAt: new Date(challenge.expiresAt).toISOString(),
  }));
}

export async function createDeviceSigningKeyPair(cryptoProvider: Crypto = globalThis.crypto): Promise<{
  privateKey: CryptoKey;
  publicKey: DeviceSigningPublicKey;
}> {
  const pair = await cryptoProvider.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'],
  ) as CryptoKeyPair;
  const publicKey = await cryptoProvider.subtle.exportKey('jwk', pair.publicKey) as DeviceSigningPublicKey;
  if (publicKey.kty !== 'EC' || publicKey.crv !== 'P-256' || !publicKey.x || !publicKey.y) {
    throw new Error('Generated device signing public key is invalid.');
  }
  return { privateKey: pair.privateKey, publicKey };
}

export async function signDeviceApprovalChallenge(
  challenge: DeviceApprovalChallenge,
  privateKey: CryptoKey,
  now: number = Date.now(),
  cryptoProvider: Crypto = globalThis.crypto,
): Promise<DeviceApprovalProof> {
  const expiresAt = Date.parse(challenge?.expiresAt ?? '');
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new Error('Device approval challenge has expired.');
  }
  const signature = await cryptoProvider.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    toArrayBuffer(canonicalChallenge(challenge)),
  );
  return { challengeId: challenge.challengeId, signature: toBase64Url(new Uint8Array(signature)) };
}

export async function verifyDeviceApprovalProof(
  challenge: DeviceApprovalChallenge,
  proof: DeviceApprovalProof,
  publicKey: DeviceSigningPublicKey,
  now: number = Date.now(),
  cryptoProvider: Crypto = globalThis.crypto,
): Promise<boolean> {
  try {
    const expiresAt = Date.parse(challenge?.expiresAt ?? '');
    if (!Number.isFinite(expiresAt) || expiresAt <= now ||
        !proof || proof.challengeId !== challenge.challengeId ||
        !publicKey || publicKey.kty !== 'EC' || publicKey.crv !== 'P-256' ||
        typeof publicKey.x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(publicKey.x) ||
        typeof publicKey.y !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(publicKey.y) ||
        'd' in (publicKey as unknown as Record<string, unknown>)) return false;
    const key = await cryptoProvider.subtle.importKey(
      'jwk', publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
    const signature = fromBase64Url(proof.signature);
    if (signature.byteLength !== 64) return false;
    return await cryptoProvider.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key, toArrayBuffer(signature),
      toArrayBuffer(canonicalChallenge(challenge)),
    );
  } catch {
    return false;
  }
}
