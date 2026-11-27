import type {
  DeviceApprovalChallenge,
  DeviceApprovalProof,
  DeviceSigningPublicKey,
} from './deviceApprovalSigningProof.ts';

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
