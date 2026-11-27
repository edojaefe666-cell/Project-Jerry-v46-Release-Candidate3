import { apiFetch, apiJson } from './apiClient.ts';
import { digestDeviceHttpBody, type DeviceHttpRequestChallenge } from './deviceHttpRequestProof.ts';
import { getOrCreateJerryDeviceId } from './deviceIdentity.ts';
import { signNativeDeviceMemoryRequestChallenge } from './nativeDeviceSigning.ts';
import type { EncryptedMemoryRecord } from './encryptedMemoryRecord.ts';

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
