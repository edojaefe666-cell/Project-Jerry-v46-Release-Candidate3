import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, KeyRound, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { apiJson } from '../lib/apiClient';
import { getNativeDeviceSigningPublicKey, signNativeDeviceApprovalChallenge } from '../lib/nativeDeviceSigning';
import { getOrCreateJerryDeviceId, getOrCreatePersistentExchangeKeyPair } from '../lib/deviceIdentity';

interface DeviceRecord {
  id: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  status: 'pending' | 'active' | 'revoked';
  createdAt: string;
  approvedAt: string | null;
  revokedAt: string | null;
  lastSeenAt: string | null;
}

interface DeviceChallenge {
  challengeId: string;
  nonce: string;
  ownerUid: string;
  approverDeviceId: string;
  targetRegistrationId: string;
  expiresAt: string;
}

function isAndroidNativeBridgeAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.JerryNativeAuth;
}

export function DeviceManagement() {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState('Jerry Android phone');

  const currentDeviceId = useMemo(() => {
    try { return getOrCreateJerryDeviceId(); } catch { return null; }
  }, []);
  const nativeAvailable = isAndroidNativeBridgeAvailable();

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiJson<{ devices: DeviceRecord[] }>('/api/devices');
      setDevices(result.devices);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load registered devices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDevices(); }, [loadDevices]);

  const registerThisDevice = async () => {
    if (!currentDeviceId || !nativeAvailable) {
      setError('Device enrollment requires Jerry running inside the Android app with its secure Keystore bridge.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const [exchange, signingPublicKey] = await Promise.all([
        getOrCreatePersistentExchangeKeyPair(currentDeviceId),
        getNativeDeviceSigningPublicKey(),
      ]);
      const result = await apiJson<{ registration: DeviceRecord }>('/api/devices/register', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: currentDeviceId,
          deviceName: deviceName.trim() || 'Jerry Android phone',
          platform: 'android',
          exchangePublicKey: exchange.publicKey,
          signingPublicKey,
        }),
      });
      setMessage(`This device was registered as pending (registration ${result.registration.id}). Approve it from another already-active Jerry device.`);
      await loadDevices();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Device registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const approveDevice = async (target: DeviceRecord) => {
    if (!currentDeviceId || !nativeAvailable) {
      setError('Approval requires an already-active Jerry Android device with its Keystore signing key.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { challenge } = await apiJson<{ challenge: DeviceChallenge }>(
        `/api/devices/${encodeURIComponent(target.id)}/approval-challenge`,
        { method: 'POST', body: JSON.stringify({ approverDeviceId: currentDeviceId }) },
      );
      const proof = await signNativeDeviceApprovalChallenge(challenge);
      await apiJson('/api/devices/approval/complete', {
        method: 'POST',
        body: JSON.stringify({ challengeId: proof.challengeId, signature: proof.signature }),
      });
      setMessage(`${target.deviceName} is now approved. The server verified the active device's Keystore signature.`);
      await loadDevices();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Device approval failed.');
    } finally {
      setBusy(false);
    }
  };

  const currentRecord = devices.find((device) => device.deviceId === currentDeviceId);
  const pendingDevices = devices.filter((device) => device.status === 'pending' && device.deviceId !== currentDeviceId);

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-300"><Smartphone className="h-5 w-5" /></div>
            <div><h2 className="text-sm font-semibold text-white">Trusted Jerry devices</h2><p className="mt-1 text-xs text-slate-400">Enroll this phone and approve additional devices using an existing active device.</p></div>
          </div>
          <button type="button" onClick={() => void loadDevices()} disabled={loading || busy} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
        </div>
        {!nativeAvailable && <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">The Android Keystore bridge is not available here. View existing registrations, but enroll and approve only from the Jerry Android app.</p>}
        {currentRecord && <p className="mt-4 rounded-lg border border-slate-700 p-3 text-xs text-slate-300">This phone: <strong>{currentRecord.status}</strong> · Device ID <span className="font-mono">{currentRecord.deviceId}</span></p>}
        {!currentRecord && currentDeviceId && <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} maxLength={80} aria-label="Device name" placeholder="Device name" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100" />
          <button type="button" onClick={() => void registerThisDevice()} disabled={busy || !nativeAvailable} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40">{busy ? 'Working…' : 'Enroll this phone'}</button>
        </div>}
        <p className="mt-3 text-[11px] text-slate-500">Enrollment stores only public keys on Jerry's server. The ECDH private key remains in local IndexedDB as a non-extractable CryptoKey; the signing private key remains in Android Keystore.</p>
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">{message}</p>}

      <div className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white">Registered devices</h3><span className="text-xs text-slate-500">{devices.length} total</span></div>
        {loading ? <p className="rounded-lg border border-slate-800 p-5 text-center text-xs text-slate-500">Loading devices…</p> : devices.length === 0 ? <p className="rounded-lg border border-slate-800 p-5 text-center text-xs text-slate-500">No devices have been enrolled yet.</p> : devices.map((device) => (
          <article key={device.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0"><div className="flex items-center gap-2 text-sm font-medium text-white"><Smartphone className="h-4 w-4 text-slate-400" />{device.deviceName}{device.deviceId === currentDeviceId ? ' (this phone)' : ''}</div><p className="mt-1 break-all font-mono text-[10px] text-slate-500">{device.deviceId}</p><p className="mt-1 text-[11px] text-slate-500">Added {new Date(device.createdAt).toLocaleString()} · {device.platform}</p></div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${device.status === 'active' ? 'bg-emerald-500/10 text-emerald-300' : device.status === 'pending' ? 'bg-amber-500/10 text-amber-200' : 'bg-slate-800 text-slate-400'}`}>{device.status}</span>
            </div>
            {device.status === 'pending' && device.deviceId !== currentDeviceId && <button type="button" onClick={() => void approveDevice(device)} disabled={busy || !nativeAvailable || !currentRecord || currentRecord.status !== 'active'} className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"><ShieldCheck className="h-3.5 w-3.5" /> Approve from this active device</button>}
            {device.status === 'pending' && device.deviceId === currentDeviceId && <p className="mt-3 flex items-center gap-2 text-xs text-amber-200"><Clock3 className="h-3.5 w-3.5" /> Waiting for approval from another active device.</p>}
            {device.status === 'active' && <p className="mt-3 flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Owner-approved device</p>}
          </article>
        ))}
      </div>
      {pendingDevices.length > 0 && !devices.some((device) => device.status === 'active' && device.deviceId === currentDeviceId) && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">An already-active device is required to approve pending devices. This phone cannot approve itself.</p>}
      <div className="rounded-lg border border-slate-800 p-4 text-xs text-slate-500"><KeyRound className="mr-2 inline h-4 w-4" />Revocation, recovery, and signing-key rotation are separate protected operations and are not enabled by this enrollment screen.</div>
    </section>
  );
}
