import { apiFetch, apiJson } from './apiClient.ts';
import { digestDeviceHttpBody, type DeviceHttpRequestChallenge } from './deviceHttpRequestProof.ts';
import { getOrCreateJerryDeviceId } from './deviceIdentity.ts';
import {
  signNativeDeviceMemoryRequestChallenge,
  unwrapNativeDeviceMemoryKeyEnvelope,
  createNativeInitialDeviceMemoryKey,
  hasNativeInstalledDeviceMemoryKey,
  wrapNativeMemoryKeyForApprovedDevice,
} from './nativeDeviceSigning.ts';
import type { DevicePublicKey } from './memoryKeyEnvelope.ts';
import type { EncryptedMemoryRecord } from './encryptedMemoryRecord.ts';
import type { DeviceKeyEnvelope } from './memoryKeyEnvelope.ts';

export interface StoredEncryptedMemoryRecord extends EncryptedMemoryRecord {
  createdAt: string;
  updatedAt: string;
}

async function signedEncryptedMemoryRequest<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<T> {
  const bodyText = body === undefined ? '' : JSON.stringify(body);
  const bodyBytes = new TextEncoder().encode(bodyText);
  const bodySha256 = await digestDeviceHttpBody(bodyBytes);
  const challengeResponse = await apiJson<{ challenge: DeviceHttpRequestChallenge }>(
    '/api/memory/encrypted/challenge',
    {
      method: 'POST',
      body: JSON.stringify({
        deviceId: getOrCreateJerryDeviceId(),
        method,
        path,
        bodySha256,
      }),
    },
  );
  if (!challengeResponse.challenge) throw new Error('Jerry backend did not issue a device request challenge.');
  const proof = await signNativeDeviceMemoryRequestChallenge(challengeResponse.challenge);
  const headers = new Headers({
    'X-Jerry-Challenge-Id': proof.challengeId,
    'X-Jerry-Device-Signature': proof.signature,
  });
  const response = await apiFetch(path, {
    method,
    ...(body === undefined ? {} : { body: bodyText }),
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string'
      ? payload.error
      : `Encrypted memory request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload as T;
}

/** Revokes another active device through a one-time signed owner-device command. */
export async function revokeApprovedJerryDevice(registrationId: string): Promise<{
  revoked: true;
  deviceName: string;
  revokedKeyEnvelopeCount: number;
  recordsPreserved: true;
}> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(registrationId)) {
    throw new Error('Jerry device registration ID is invalid.');
  }
  const result = await signedEncryptedMemoryRequest<{
    revoked: true;
    deviceName: string;
    revokedKeyEnvelopeCount: number;
    recordsPreserved: true;
  }>('POST', `/api/devices/${registrationId}/revoke`, {});
  if (result.revoked !== true || result.recordsPreserved !== true ||
      typeof result.revokedKeyEnvelopeCount !== 'number') {
    throw new Error('Jerry did not confirm the complete device revocation.');
  }
  return result;
}

/** Fetches opaque ciphertext envelopes; decryption and search stay on-device. */
export async function listEncryptedMemoryRecords(): Promise<StoredEncryptedMemoryRecord[]> {
  const result = await signedEncryptedMemoryRequest<{ records: StoredEncryptedMemoryRecord[] }>(
    'GET', '/api/memory/encrypted',
  );
  return result.records;
}

/** Creates a ciphertext envelope. Android displays an owner confirmation before signing. */
export async function createEncryptedMemoryRecord(
  record: EncryptedMemoryRecord,
): Promise<StoredEncryptedMemoryRecord> {
  const result = await signedEncryptedMemoryRequest<{ record: StoredEncryptedMemoryRecord }>(
    'POST', '/api/memory/encrypted', record,
  );
  return result.record;
}

/** Reads one opaque ciphertext envelope from the owner-scoped store. */
export async function getEncryptedMemoryRecord(recordId: string): Promise<StoredEncryptedMemoryRecord> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(recordId)) throw new Error('Encrypted memory record ID is invalid.');
  const result = await signedEncryptedMemoryRequest<{ record: StoredEncryptedMemoryRecord }>(
    'GET', `/api/memory/encrypted/${recordId}`,
  );
  return result.record;
}

/** Compare-and-swap update. Android displays an owner confirmation before signing. */
export async function updateEncryptedMemoryRecord(
  record: EncryptedMemoryRecord,
  expectedRevision: number,
): Promise<StoredEncryptedMemoryRecord> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error('Expected encrypted memory revision is invalid.');
  }
  const result = await signedEncryptedMemoryRequest<{ record: StoredEncryptedMemoryRecord }>(
    'PUT',
    `/api/memory/encrypted/${record.recordId}`,
    { record, expectedRevision },
  );
  return result.record;
}

/**
 * Retrieves the envelope addressed to this already-approved device and installs
 * the unwrapped data key inside Android's native protected storage.
 */
export async function fetchAndInstallDeviceMemoryKeyEnvelope(
  ownerUid: string,
  keyVersion: number,
): Promise<void> {
  if (typeof ownerUid !== 'string' || !ownerUid.trim() || ownerUid.length > 160 ||
      !Number.isSafeInteger(keyVersion) || keyVersion < 1) {
    throw new Error('Memory key owner or version is invalid.');
  }
  const deviceId = getOrCreateJerryDeviceId();
  const result = await signedEncryptedMemoryRequest<{
    envelope: {
      version: 1;
      algorithm: DeviceKeyEnvelope['algorithm'];
      context: DeviceKeyEnvelope['context'];
      ephemeralPublicKey: DeviceKeyEnvelope['ephemeralPublicKey'];
      salt: string;
      iv: string;
      ciphertext: string;
    };
  }>('GET', `/api/memory/key-envelopes/${keyVersion}`);
  const envelope = result.envelope;
  if (!envelope || envelope.version !== 1 ||
      envelope.algorithm !== 'ECDH-P256-HKDF-SHA256-AES-256-GCM' ||
      envelope.context.ownerUid !== ownerUid ||
      envelope.context.deviceId !== deviceId ||
      envelope.context.keyVersion !== keyVersion) {
    throw new Error('Jerry returned a memory-key envelope for a different owner, device, or version.');
  }
  await unwrapNativeDeviceMemoryKeyEnvelope(envelope, {
    ownerUid,
    deviceId,
    keyVersion,
  });
}

/** Verifies that the current Android device has the requested protected memory key. */
export async function isAndroidMemoryKeyInstalled(
  ownerUid: string,
  keyVersion = 1,
): Promise<boolean> {
  if (typeof ownerUid !== 'string' || !ownerUid.trim() || ownerUid.length > 160 ||
      !Number.isSafeInteger(keyVersion) || keyVersion < 1) {
    throw new Error('Memory-key owner or version is invalid.');
  }
  return hasNativeInstalledDeviceMemoryKey(ownerUid, getOrCreateJerryDeviceId(), keyVersion);
}

/** Initializes a local memory key after an explicit native owner confirmation. */
export async function initializeAndroidMemoryKey(
  ownerUid: string,
  keyVersion = 1,
): Promise<void> {
  if (typeof ownerUid !== 'string' || !ownerUid.trim() || ownerUid.length > 160 ||
      !Number.isSafeInteger(keyVersion) || keyVersion < 1) {
    throw new Error('Memory-key owner or version is invalid.');
  }
  await createNativeInitialDeviceMemoryKey(ownerUid, getOrCreateJerryDeviceId(), keyVersion);
}

/**
 * Creates and uploads an envelope for a target device. Android confirms the
 * recipient before wrapping; the authenticated server independently verifies
 * that both sender and recipient registrations are active and owner-approved.
 */
export async function shareAndroidMemoryKeyWithApprovedDevice(
  ownerUid: string,
  recipientDeviceId: string,
  recipientPublicKey: DevicePublicKey,
  keyVersion = 1,
): Promise<void> {
  if (typeof ownerUid !== 'string' || !ownerUid.trim() || ownerUid.length > 160 ||
      !Number.isSafeInteger(keyVersion) || keyVersion < 1 ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(recipientDeviceId)) {
    throw new Error('Memory-key recipient or context is invalid.');
  }
  const senderDeviceId = getOrCreateJerryDeviceId();
  const envelope = await wrapNativeMemoryKeyForApprovedDevice(
    ownerUid, senderDeviceId, recipientDeviceId, keyVersion, recipientPublicKey,
  );
  await signedEncryptedMemoryRequest<{ stored: boolean }>(
    'POST',
    '/api/memory/key-envelopes',
    { recipientDeviceId, envelope },
  );
}

export interface OwnerMemoryRecoveryEnvelopePayload {
  version: 1;
  algorithm: 'HKDF-SHA256-AES-256-GCM';
  context: { ownerUid: string; keyVersion: number };
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface StoredOwnerMemoryRecoveryEnvelope extends OwnerMemoryRecoveryEnvelopePayload {
  id: string;
  createdAt: string;
}

function assertOwnerMemoryRecoveryEnvelope(
  envelope: StoredOwnerMemoryRecoveryEnvelope,
  ownerUid: string,
  keyVersion: number,
): void {
  if (!envelope || envelope.version !== 1 ||
      envelope.algorithm !== 'HKDF-SHA256-AES-256-GCM' ||
      envelope.context?.ownerUid !== ownerUid ||
      envelope.context?.keyVersion !== keyVersion ||
      !/^[A-Za-z0-9_-]{43}$/.test(envelope.salt) ||
      !/^[A-Za-z0-9_-]{16}$/.test(envelope.iv) ||
      !/^[A-Za-z0-9_-]{64}$/.test(envelope.ciphertext) ||
      Object.keys(envelope).some((key) =>
        !['version', 'algorithm', 'context', 'salt', 'iv', 'ciphertext'].includes(key),
      ) ||
      Object.keys(envelope.context).some((key) => !['ownerUid', 'keyVersion'].includes(key))) {
    throw new Error('Jerry returned an invalid or incorrectly scoped owner memory recovery envelope.');
  }
}

/**
 * Stores only the encrypted envelope after the owner has safely backed up the
 * one-time recovery secret offline. This endpoint deliberately does not accept
 * a recovery secret and does not require an already-trusted device signature;
 * Firebase recent reauthentication is enforced by the server.
 */
export async function storeOwnerMemoryRecoveryEnvelope(
  envelope: OwnerMemoryRecoveryEnvelopePayload,
  ownerUid: string,
  keyVersion: number,
): Promise<void> {
  if (typeof ownerUid !== 'string' || !ownerUid.trim() || ownerUid.length > 160 ||
      !Number.isSafeInteger(keyVersion) || keyVersion < 1) {
    throw new Error('Memory recovery owner or key version is invalid.');
  }
  assertOwnerMemoryRecoveryEnvelope(envelope, ownerUid, keyVersion);
  const result = await apiJson<{ envelope: StoredOwnerMemoryRecoveryEnvelope }>('/api/memory/recovery-envelope', {
    method: 'POST',
    body: JSON.stringify({ envelope }),
    cache: 'no-store',
  });
  assertStoredOwnerMemoryRecoveryEnvelope(result.envelope, ownerUid, keyVersion);
}

/**
 * Retrieves the owner-scoped ciphertext after recent Firebase reauthentication.
 * The recovery secret is supplied separately by the owner and never sent here.
 */
export async function getOwnerMemoryRecoveryEnvelope(
  ownerUid: string,
  keyVersion: number,
): Promise<StoredOwnerMemoryRecoveryEnvelope> {
  if (typeof ownerUid !== 'string' || !ownerUid.trim() || ownerUid.length > 160 ||
      !Number.isSafeInteger(keyVersion) || keyVersion < 1) {
    throw new Error('Memory recovery owner or key version is invalid.');
  }
  const result = await apiJson<{ envelope: StoredOwnerMemoryRecoveryEnvelope }>(
    `/api/memory/recovery-envelope/${keyVersion}`,
    { method: 'GET', cache: 'no-store' },
  );
  assertStoredOwnerMemoryRecoveryEnvelope(result.envelope, ownerUid, keyVersion);
  return result.envelope;
}

function assertStoredOwnerMemoryRecoveryEnvelope(
  envelope: StoredOwnerMemoryRecoveryEnvelope,
  ownerUid: string,
  keyVersion: number,
): void {
  assertOwnerMemoryRecoveryEnvelope(envelope, ownerUid, keyVersion);
  if (typeof envelope.id !== 'string' || !envelope.id ||
      typeof envelope.createdAt !== 'string' || !Number.isFinite(Date.parse(envelope.createdAt)) ||
      Object.keys(envelope).some((key) =>
        !['id', 'createdAt', 'version', 'algorithm', 'context', 'salt', 'iv', 'ciphertext'].includes(key),
      )) {
    throw new Error('Jerry returned an invalid stored owner memory recovery record.');
  }
}
