import { createDeviceKeyPair, type DevicePublicKey } from './memoryKeyEnvelope.ts';

const DEVICE_ID_STORAGE_KEY = 'jerry.device.identity.v1';
const DATABASE_NAME = 'jerry-device-identity';
const DATABASE_VERSION = 1;
const STORE_NAME = 'exchange-keys';

interface StoredExchangeKeyPair {
  deviceId: string;
  privateKey: CryptoKey;
  publicKey: DevicePublicKey;
}

function openIdentityDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Secure device-key storage is unavailable in this browser.'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'deviceId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open secure device-key storage.'));
    request.onblocked = () => reject(new Error('Secure device-key storage upgrade is blocked by another Jerry tab.'));
  });
}

export function getOrCreateJerryDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) return existing;
  const created = `jerry_${crypto.randomUUID().replace(/-/g, '')}`;
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
  return created;
}

/**
 * Keeps the non-extractable ECDH private key in IndexedDB. Only its public JWK
 * is returned to registration; the private CryptoKey never leaves this device.
 */
export async function getOrCreatePersistentExchangeKeyPair(
  deviceId: string,
): Promise<{ privateKey: CryptoKey; publicKey: DevicePublicKey }> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(deviceId)) {
    throw new Error('Jerry device identifier is invalid.');
  }
  const database = await openIdentityDatabase();
  try {
    const existing = await new Promise<StoredExchangeKeyPair | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(deviceId);
      request.onsuccess = () => resolve(request.result as StoredExchangeKeyPair | undefined);
      request.onerror = () => reject(request.error ?? new Error('Could not read the device exchange key.'));
    });
    if (existing?.privateKey && existing.publicKey) {
      return { privateKey: existing.privateKey, publicKey: existing.publicKey };
    }

    const generated = await createDeviceKeyPair();
    const record: StoredExchangeKeyPair = {
      deviceId,
      privateKey: generated.privateKey,
      publicKey: generated.publicKey,
    };
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const check = store.get(deviceId);
      check.onsuccess = () => {
        if (!check.result) store.add(record);
      };
      check.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not persist the device exchange key.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Device exchange key storage was aborted.'));
    });

    const saved = await new Promise<StoredExchangeKeyPair | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(deviceId);
      request.onsuccess = () => resolve(request.result as StoredExchangeKeyPair | undefined);
      request.onerror = () => reject(request.error ?? new Error('Could not verify the stored device exchange key.'));
    });
    if (!saved?.privateKey || !saved.publicKey) {
      throw new Error('Jerry could not verify that the device exchange key was saved.');
    }
    return { privateKey: saved.privateKey, publicKey: saved.publicKey };
  } finally {
    database.close();
  }
}
