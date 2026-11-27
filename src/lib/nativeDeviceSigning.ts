import type {
  DeviceApprovalChallenge,
  DeviceApprovalProof,
  DeviceSigningPublicKey,
} from './deviceApprovalSigningProof.ts';

export interface NativeDeviceHttpChallenge {
  challengeId: string;
  nonce: string;
  ownerUid: string;
  deviceId: string;
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  bodySha256: string;
  expiresAt: string;
}
export interface NativeDeviceHttpProof {
  challengeId: string;
  signature: string;
}

type NativeBridgeReply = {
  requestId?: string;
  ok?: boolean;
  error?: string;
  publicKey?: DeviceSigningPublicKey;
  proof?: DeviceApprovalProof;
};

type NativeBridge = {
  postMessage(message: string): void;
  onmessage: ((event: MessageEvent<string>) => void) | null;
};

declare global {
  interface Window {
    JerryNativeAuth?: NativeBridge;
  }
}

const pending = new Map<string, {
  resolve: (reply: NativeBridgeReply) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();

let listenerInstalled = false;

function bridge(): NativeBridge {
  if (typeof window === 'undefined' || !window.JerryNativeAuth) {
    throw new Error('Jerry Android Keystore bridge is unavailable on this device.');
  }
  const native = window.JerryNativeAuth;
  if (!listenerInstalled) {
    native.onmessage = (event) => {
      let reply: NativeBridgeReply;
      try {
        reply = JSON.parse(String(event.data)) as NativeBridgeReply;
      } catch {
        return;
      }
      const id = reply.requestId;
      if (!id) return;
      const waiter = pending.get(id);
      if (!waiter) return;
      clearTimeout(waiter.timeout);
      pending.delete(id);
      if (reply.ok !== true) waiter.reject(new Error(reply.error || 'Native device signing failed.'));
      else waiter.resolve(reply);
    };
    listenerInstalled = true;
  }
  return native;
}

function requestNative<T>(
  type: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const native = bridge();
  const requestId = crypto.randomUUID().replace(/-/g, '_');
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('Android Keystore request timed out.'));
    }, 15_000);
    pending.set(requestId, {
      resolve: (reply) => resolve(reply as T),
      reject,
      timeout,
    });
    try {
      native.postMessage(JSON.stringify({ type, requestId, ...payload }));
    } catch (error) {
      clearTimeout(timeout);
      pending.delete(requestId);
      reject(error instanceof Error ? error : new Error('Unable to contact Android Keystore.'));
    }
  });
}

/** Creates the device identity on first explicit enrollment request, then returns its public JWK. */
export async function getNativeDeviceSigningPublicKey(): Promise<DeviceSigningPublicKey> {
  const reply = await requestNative<NativeBridgeReply>('getDeviceSigningPublicKey');
  if (!reply.publicKey) throw new Error('Android Keystore did not return a public signing key.');
  return reply.publicKey;
}

/** Signs a server-issued, owner/device/target-bound challenge inside Android Keystore. */
export async function signNativeDeviceApprovalChallenge(
  challenge: DeviceApprovalChallenge,
): Promise<DeviceApprovalProof> {
  const reply = await requestNative<NativeBridgeReply>('signDeviceApprovalChallenge', { challenge });
  if (!reply.proof) throw new Error('Android Keystore did not return an approval proof.');
  return reply.proof;
}

/** Deletes the local private signing key; call only as part of an explicit owner recovery/revocation flow. */
export async function deleteNativeDeviceSigningKey(): Promise<void> {
  await requestNative<NativeBridgeReply>('deleteDeviceSigningKey');
}
/** Signs one server-issued encrypted-memory request challenge in Android Keystore. */
export async function signNativeDeviceMemoryRequestChallenge(
  challenge: NativeDeviceHttpChallenge,
): Promise<NativeDeviceHttpProof> {
  const reply = await requestNative<NativeBridgeReply>('signDeviceMemoryRequestChallenge', { challenge });
  if (!reply.proof || typeof reply.proof !== 'object' ||
      typeof (reply.proof as NativeDeviceHttpProof).challengeId !== 'string' ||
      typeof (reply.proof as NativeDeviceHttpProof).signature !== 'string') {
    throw new Error('Android Keystore did not return a memory request proof.');
  }
  return reply.proof as NativeDeviceHttpProof;
}

/** Public P-256 ECDH identity used only to receive owner-authorized memory-key envelopes. */
export async function getNativeDeviceMemoryExchangePublicKey(): Promise<DeviceSigningPublicKey> {
  const reply = await requestNative<NativeBridgeReply>('getDeviceMemoryExchangePublicKey');
  if (!reply.publicKey || reply.publicKey.kty !== 'EC' || reply.publicKey.crv !== 'P-256' ||
      !/^[A-Za-z0-9_-]{43}$/.test(reply.publicKey.x) ||
      !/^[A-Za-z0-9_-]{43}$/.test(reply.publicKey.y) ||
      'd' in (reply.publicKey as unknown as Record<string, unknown>)) {
    throw new Error('Android Keystore did not return a valid public memory-exchange key.');
  }
  return reply.publicKey;
}

/** Deletes the local ECDH identity; existing device envelopes will no longer be decryptable. */
export async function deleteNativeDeviceMemoryExchangeKey(): Promise<void> {
  await requestNative<NativeBridgeReply>('deleteDeviceMemoryExchangeKey');
}

/**
 * Installs a server-delivered owner/device/key-version-bound envelope.
 * Android performs ECDH, HKDF and AES-GCM natively; raw data-key bytes never
 * cross the WebView bridge. The caller must obtain the envelope through the
 * authenticated owner/device key-envelope API first.
 */
export async function unwrapNativeDeviceMemoryKeyEnvelope(
  envelope: DeviceKeyEnvelope,
  expectedContext: { ownerUid: string; deviceId: string; keyVersion: number },
): Promise<void> {
  const reply = await requestNative<NativeBridgeReply>('unwrapDeviceMemoryKeyEnvelope', {
    envelope,
    ownerUid: expectedContext.ownerUid,
    deviceId: expectedContext.deviceId,
    keyVersion: expectedContext.keyVersion,
  });
  if (reply.installed !== true) {
    throw new Error('Android did not confirm protected memory-key installation.');
  }
}
