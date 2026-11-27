import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, KeyRound, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { apiJson } from '../lib/apiClient';
import { useAuth } from '../lib/AuthContext';
import { fetchAndInstallDeviceMemoryKeyEnvelope, isAndroidMemoryKeyInstalled, revokeApprovedJerryDevice, shareAndroidMemoryKeyWithApprovedDevice, storeOwnerMemoryRecoveryEnvelope, getOwnerMemoryRecoveryEnvelope } from '../lib/encryptedMemoryApi';
import { bootstrapFirstJerryOwnerDevice, requestAndroidDeviceEnrollment, approvePendingJerryDevice } from '../lib/deviceEnrollmentApi';
import { getOrCreateJerryDeviceId } from '../lib/deviceIdentity';
import { createNativeOwnerMemoryRecoveryEnvelope, restoreNativeOwnerMemoryRecoveryEnvelope } from '../lib/nativeDeviceSigning';

interface DeviceRecord {
  id: string;
  deviceId: string;
  deviceName: string;
  exchangePublicKey: { kty: 'EC'; crv: 'P-256'; x: string; y: string };
  platform: string;
  status: 'pending' | 'active' | 'revoked';
  createdAt: string;
  approvedAt: string | null;
  revokedAt: string | null;
  lastSeenAt: string | null;
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
  const [confirmRevokeDeviceId, setConfirmRevokeDeviceId] = useState<string | null>(null);
  const [recoverySecret, setRecoverySecret] = useState('');
  const [recoveryEnvelope, setRecoveryEnvelope] = useState<Awaited<ReturnType<typeof createNativeOwnerMemoryRecoveryEnvelope>>['envelope'] | null>(null);
  const [recoveryBackupAcknowledged, setRecoveryBackupAcknowledged] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoveryConfigured, setRecoveryConfigured] = useState(false);
  const { user, reauthenticateWithGoogle } = useAuth();

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
      const registration = await requestAndroidDeviceEnrollment(deviceName.trim() || 'Jerry Android phone');
      setMessage(`This phone is registered as pending (registration ${registration.id}). If it is the first trusted device, complete the owner-confirmed first-device setup below.`);
      await loadDevices();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Device registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const bootstrapFirstDevice = async () => {
    if (!currentRecord || currentRecord.status !== 'pending') return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await bootstrapFirstJerryOwnerDevice(currentRecord.id);
      setMessage('This phone is now Jerry’s first trusted owner device. The server verified recent owner authentication and the Android Keystore confirmation.');
      await loadDevices();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'First-device trust could not be established.');
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
      await approvePendingJerryDevice(target.id);
      setMessage(`${target.deviceName} is now approved. The server verified this active device’s Keystore signature.`);
      await loadDevices();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Device approval failed.');
    } finally {
      setBusy(false);
    }
  };

  const currentRecord = devices.find((device) => device.deviceId === currentDeviceId);

  const restoreMemoryKey = async () => {
    if (!user?.uid || !currentRecord || currentRecord.status !== 'active' || !nativeAvailable) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await fetchAndInstallDeviceMemoryKeyEnvelope(user.uid, 1);
      if (!(await isAndroidMemoryKeyInstalled(user.uid, 1))) throw new Error('Android did not confirm that the recovered key was installed.');
      setMessage('The encrypted-memory key was restored to this approved phone. Existing ciphertext has not been changed.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Memory-key restoration failed.'); }
    finally { setBusy(false); }
  };

  const shareMemoryKey = async (target: DeviceRecord) => {
    if (!user?.uid || !currentRecord || currentRecord.status !== 'active' || target.status !== 'active' || !nativeAvailable) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      if (!(await isAndroidMemoryKeyInstalled(user.uid, 1))) throw new Error('This phone does not have the local protected memory key. Restore it first.');
      await shareAndroidMemoryKeyWithApprovedDevice(user.uid, target.deviceId, target.exchangePublicKey, 1);
      setMessage('A wrapped memory-key envelope was stored for the approved recipient. The recipient must separately restore it on that device.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Memory-key sharing failed.'); }
    finally { setBusy(false); }
  };
  const createRecoveryBackup = async () => {
    if (!user?.uid || !currentRecord || currentRecord.status !== 'active' || !nativeAvailable) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await reauthenticateWithGoogle();
      try {
        await getOwnerMemoryRecoveryEnvelope(user.uid, 1);
        setRecoveryConfigured(true);
        setMessage('An owner recovery envelope already exists for key version 1. Jerry will not overwrite it; use your existing offline recovery key.');
        return;
      } catch (cause) {
        if (!(cause instanceof Error) || !/no owner recovery envelope exists|not found|404/i.test(cause.message)) throw cause;
      }
      if (!(await isAndroidMemoryKeyInstalled(user.uid, 1))) throw new Error('This phone does not have the protected memory key. Restore it before creating a recovery backup.');
      const created = await createNativeOwnerMemoryRecoveryEnvelope(user.uid, currentDeviceId || getOrCreateJerryDeviceId(), 1);
      setRecoverySecret(created.recoveryKey); setRecoveryEnvelope(created.envelope); setRecoveryBackupAcknowledged(false);
      setMessage('Your one-time recovery key is ready. Store it offline before Jerry uploads the encrypted envelope.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Owner recovery setup failed.'); }
    finally { setBusy(false); }
  };

  const storeRecoveryBackup = async () => {
    if (!user?.uid || !recoverySecret || !recoveryEnvelope || !recoveryBackupAcknowledged) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await storeOwnerMemoryRecoveryEnvelope(recoveryEnvelope, user.uid, 1);
      setRecoverySecret(''); setRecoveryEnvelope(null); setRecoveryBackupAcknowledged(false); setRecoveryConfigured(true);
      setMessage('Encrypted recovery envelope stored. Jerry did not receive or store your recovery secret. Keep your offline copy safe.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Encrypted recovery backup could not be stored.'); }
    finally { setBusy(false); }
  };

  const restoreFromOwnerRecovery = async () => {
    if (!user?.uid || !nativeAvailable) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await reauthenticateWithGoogle();
      const envelope = await getOwnerMemoryRecoveryEnvelope(user.uid, 1);
      const deviceId = getOrCreateJerryDeviceId();
      await restoreNativeOwnerMemoryRecoveryEnvelope(envelope, recoveryInput.trim(), user.uid, deviceId, 1);
      if (!(await isAndroidMemoryKeyInstalled(user.uid, 1))) throw new Error('Android did not confirm that the recovered memory key was installed.');
      setRecoveryInput('');
      setMessage('Owner-held recovery succeeded. The memory key is protected locally on this phone; encrypted records were not changed.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Owner-held memory recovery failed.'); }
    finally { setBusy(false); }
  };

  const revokeDevice = async (target: DeviceRecord) => {
    if (!currentRecord || currentRecord.status !== 'active' || target.status !== 'active' ||
        target.deviceId === currentDeviceId || !nativeAvailable) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await revokeApprovedJerryDevice(target.id);
      setConfirmRevokeDeviceId(null);
      setMessage(`${result.deviceName} was revoked. ${result.revokedKeyEnvelopeCount} key envelope(s) were disabled; encrypted memory records were preserved.`);
      await loadDevices();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Device revocation failed.');
    } finally { setBusy(false); }
  };

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
        {currentRecord?.status === 'pending' && !devices.some((device) => device.status === 'active') && <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold text-amber-100">First trusted device setup</p>
          <p className="mt-1 text-xs text-amber-200">No active owner device exists. After a recent Firebase sign-in, you can establish this phone as the first trusted device. Android will ask you to confirm explicitly.</p>
          <button type="button" onClick={() => void bootstrapFirstDevice()} disabled={busy || !nativeAvailable} className="mt-3 rounded-lg bg-amber-300 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40">{busy ? 'Working…' : 'Trust this phone as first device'}</button>
        </div>}
        {!currentRecord && currentDeviceId && <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} maxLength={80} aria-label="Device name" placeholder="Device name" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100" />
          <button type="button" onClick={() => void registerThisDevice()} disabled={busy || !nativeAvailable} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40">{busy ? 'Working…' : 'Enroll this phone'}</button>
        </div>}
        <p className="mt-3 text-[11px] text-slate-500">Enrollment stores only public keys on Jerry’s server. Android signing keys remain in Android Keystore; the Android 10 exchange private key is locally encrypted using an Android Keystore-protected AES key.</p>
      </div>

      <section className="rounded-xl border border-cyan-900/60 bg-slate-950/60 p-5 space-y-4">
        <div><h2 className="text-sm font-semibold text-white">Owner-held encrypted memory recovery</h2><p className="mt-1 text-xs text-slate-400">Your recovery secret stays with you. Jerry stores only the encrypted envelope and cannot unlock it.</p></div>
        {currentRecord?.status === 'active' && !recoverySecret && !recoveryConfigured && <button type="button" onClick={() => void createRecoveryBackup()} disabled={busy || !nativeAvailable || !user?.uid} className="rounded-lg border border-cyan-500/40 px-3 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-40">{busy ? 'Working…' : 'Create one-time recovery key'}</button>}
        {recoveryConfigured && <p className="rounded-lg border border-emerald-500/30 p-3 text-xs text-emerald-200">An encrypted recovery envelope is already stored for key version 1. Jerry cannot replace it automatically.</p>}
        {recoverySecret && recoveryEnvelope && <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-xs font-semibold text-amber-100">Your recovery secret — shown once</p>
          <p className="text-xs text-amber-200">Write this down or store it in a secure offline password manager. Do not send it to anyone or paste it into a chat. Jerry will not upload or save this secret.</p>
          <div className="break-all rounded-lg bg-slate-900 p-3 font-mono text-sm tracking-wider text-white select-all">{recoverySecret}</div>
          <label className="flex items-start gap-2 text-xs text-slate-200"><input type="checkbox" checked={recoveryBackupAcknowledged} onChange={(event) => setRecoveryBackupAcknowledged(event.target.checked)} />I have safely stored this recovery secret offline and understand that losing it together with all trusted devices makes encrypted memory unrecoverable.</label>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void storeRecoveryBackup()} disabled={busy || !recoveryBackupAcknowledged} className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40">Store encrypted envelope</button><button type="button" onClick={() => { setRecoverySecret(''); setRecoveryEnvelope(null); setRecoveryBackupAcknowledged(false); }} disabled={busy} className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200">Discard secret</button></div>
        </div>}
        <div className="space-y-2 border-t border-slate-800 pt-4">
          <h3 className="text-xs font-semibold text-white">Recover on a replacement phone</h3>
          <p className="text-xs text-slate-400">Sign in to the same Jerry owner account, enter your offline recovery secret, and restore locally. This does not require an existing trusted device.</p>
          <input type="password" autoComplete="off" spellCheck={false} maxLength={43} value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value)} placeholder="43-character offline recovery secret" aria-label="Owner memory recovery secret" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-white" />
          <button type="button" onClick={() => void restoreFromOwnerRecovery()} disabled={busy || !nativeAvailable || !user?.uid || !/^[A-Za-z0-9_-]{43}$/.test(recoveryInput.trim())} className="rounded-lg border border-cyan-500/40 px-3 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-40">{busy ? 'Working…' : 'Reauthenticate and restore memory'}</button>
        </div>
      </section>

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
            {device.status === 'active' && device.deviceId === currentDeviceId && <button type="button" onClick={() => void restoreMemoryKey()} disabled={busy || !nativeAvailable || !user?.uid} className="mt-3 rounded-lg border border-cyan-500/40 px-3 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-40">Restore encrypted-memory key to this phone</button>}
            {device.status === 'active' && device.deviceId !== currentDeviceId && currentRecord?.status === 'active' && <button type="button" onClick={() => void shareMemoryKey(device)} disabled={busy || !nativeAvailable || !user?.uid} className="mt-3 rounded-lg border border-cyan-500/40 px-3 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-40">Share memory key to this approved device</button>}
            {device.status === 'active' && device.deviceId !== currentDeviceId && currentRecord?.status === 'active' && <button type="button" onClick={() => setConfirmRevokeDeviceId(device.id)} disabled={busy || !nativeAvailable} className="mt-3 ml-2 rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-40">Revoke device</button>}
            {confirmRevokeDeviceId === device.id && <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
              <p className="text-xs font-semibold text-rose-100">Revoke {device.deviceName}?</p>
              <p className="mt-1 text-xs text-rose-200">This blocks future server requests and disables this device's stored key envelopes. Encrypted memory records and revocation evidence are preserved. It cannot remotely erase data or keys already present on the other phone. This phone cannot revoke itself, and Jerry will not revoke the last active owner device.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void revokeDevice(device)} disabled={busy || !nativeAvailable} className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy ? 'Revoking…' : 'Confirm revocation'}</button>
                <button type="button" onClick={() => setConfirmRevokeDeviceId(null)} disabled={busy} className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200">Cancel</button>
              </div>
            </div>}
          </article>
        ))}
      </div>
      {pendingDevices.length > 0 && !devices.some((device) => device.status === 'active' && device.deviceId === currentDeviceId) && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">An already-active device is required to approve pending devices. This phone cannot approve itself.</p>}
      <div className="rounded-lg border border-slate-800 p-4 text-xs text-slate-500"><KeyRound className="mr-2 inline h-4 w-4" />Memory-key sharing is a separate owner action. Android confirms the recipient before wrapping; recovery requires an envelope previously shared to this approved phone. Key rotation remains a separate protected operation.</div>
    </section>
  );
}
