import { apiJson } from './apiClient.ts';
import { getOrCreateJerryDeviceId } from './deviceIdentity.ts';
import {
  getNativeDeviceSigningPublicKey,
  getNativeDeviceMemoryExchangePublicKey,
  signNativeDeviceApprovalChallenge,
} from './nativeDeviceSigning.ts';
import type { DeviceApprovalChallenge } from './deviceApprovalSigningProof.ts';

export type JerryDeviceRegistration = {
  id: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  exchangePublicKey: {
    kty: 'EC';
    crv: 'P-256';
    x: string;
    y: string;
  };
  status: 'pending' | 'active' | 'revoked';
  createdAt: string;
  approvedAt: string | null;
  revokedAt: string | null;
  lastSeenAt: string | null;
};

function assertRegistrationId(value: string): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw new Error('Jerry device registration ID is invalid.');
  }
}

/**
 * Requests enrollment of this Android installation. Server-side status is
 * always pending; this function cannot approve the device or bypass owner review.
 */
export async function requestAndroidDeviceEnrollment(
  deviceName = 'Jerry Android device',
): Promise<JerryDeviceRegistration> {
  const deviceId = getOrCreateJerryDeviceId();
  const [signingPublicKey, exchangePublicKey] = await Promise.all([
    getNativeDeviceSigningPublicKey(),
    getNativeDeviceMemoryExchangePublicKey(),
  ]);
  const result = await apiJson<{ registration: JerryDeviceRegistration }>('/api/devices/register', {
    method: 'POST',
    body: JSON.stringify({
      deviceId,
      deviceName,
      platform: 'android',
      signingPublicKey,
      exchangePublicKey,
    }),
  });
  if (!result.registration || result.registration.deviceId !== deviceId ||
      result.registration.status !== 'pending') {
    throw new Error('Jerry did not return the expected pending device registration.');
  }
  return result.registration;
}

/** Lists owner-scoped device registrations; no private keys or key envelopes are returned. */
export async function listJerryDeviceRegistrations(): Promise<JerryDeviceRegistration[]> {
  const result = await apiJson<{ devices: JerryDeviceRegistration[] }>('/api/devices');
  if (!Array.isArray(result.devices)) throw new Error('Jerry returned an invalid device list.');
  return result.devices;
}

/**
 * Owner approves a pending device from an already-active Android device.
 * Native Android displays its explicit approval dialog before signing.
 * A first device cannot use this path to self-approve.
 */
export async function approvePendingJerryDevice(registrationId: string): Promise<void> {
  assertRegistrationId(registrationId);
  const approverDeviceId = getOrCreateJerryDeviceId();
  const challengeResult = await apiJson<{ challenge: DeviceApprovalChallenge }>(
    `/api/devices/${registrationId}/approval-challenge`,
    {
      method: 'POST',
      body: JSON.stringify({ approverDeviceId }),
    },
  );
  if (!challengeResult.challenge ||
      challengeResult.challenge.targetRegistrationId !== registrationId ||
      challengeResult.challenge.approverDeviceId !== approverDeviceId) {
    throw new Error('Jerry returned an approval challenge for a different device.');
  }
  const proof = await signNativeDeviceApprovalChallenge(challengeResult.challenge);
  const completion = await apiJson<{ approved: boolean }>('/api/devices/approval/complete', {
    method: 'POST',
    body: JSON.stringify(proof),
  });
  if (completion.approved !== true) {
    throw new Error('Jerry did not confirm device approval.');
  }
}
