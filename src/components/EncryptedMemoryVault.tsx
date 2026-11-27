import { useMemo, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import {
  createEncryptedMemoryRecord,
  initializeAndroidMemoryKey,
  listEncryptedMemoryRecords,
  type StoredEncryptedMemoryRecord,
} from '../lib/encryptedMemoryApi';
import {
  decryptMemoryRecordOnAndroid,
  encryptMemoryRecordOnAndroid,
  type EncryptedMemoryPayload,
} from '../lib/encryptedMemoryRecord';
import type { JerryMemoryArea, MemoryEntry } from '../lib/types';

const AREAS: Array<{ value: JerryMemoryArea; label: string }> = [
  { value: 'owner_profile', label: 'Owner Profile' },
  { value: 'mission_projects', label: 'Mission & Projects' },
  { value: 'knowledge_experience', label: 'Knowledge & Experience' },
];
type VaultEntry = EncryptedMemoryPayload & { recordId: string };

function makeRecordId(): string {
  return `jerry_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function EncryptedMemoryVault() {
  const { user } = useAuth();
  const [keyReady, setKeyReady] = useState(false);
  const [records, setRecords] = useState<VaultEntry[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<MemoryEntry['category']>('lesson');
  const [area, setArea] = useState<JerryMemoryArea>('mission_projects');
  const [tags, setTags] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter((entry) => !entry.deleted && (!needle ||
      [entry.title, entry.content, entry.category, entry.area, ...entry.tags]
        .join(' ').toLocaleLowerCase().includes(needle)));
  }, [records, query]);

  const prepareKey = async () => {
    if (!user?.uid) {
      setError('Sign in to Jerry before setting up the encrypted vault.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      if (!window.JerryNativeAuth) throw new Error('Open Jerry inside the Android app to use its protected Keystore.');
      await initializeAndroidMemoryKey(user.uid, 1);
      setKeyReady(true);
      setMessage('The local memory-key setup was confirmed by Android.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not initialize the local memory key.');
    } finally { setBusy(false); }
  };

  const loadVault = async () => {
    if (!user?.uid) { setError('Sign in before loading the encrypted vault.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      if (!window.JerryNativeAuth) throw new Error('The Android Keystore bridge is unavailable.');
      const envelopes: StoredEncryptedMemoryRecord[] = await listEncryptedMemoryRecords();
      const decrypted: VaultEntry[] = [];
      const failures: string[] = [];
      for (const envelope of envelopes) {
        try {
          const context = {
            ownerUid: user.uid,
            recordId: envelope.recordId,
            keyVersion: envelope.keyVersion,
            revision: envelope.revision,
          };
          const payload = await decryptMemoryRecordOnAndroid(envelope, context);
          decrypted.push({ ...payload, recordId: envelope.recordId });
        } catch {
          failures.push(envelope.recordId);
        }
      }
      setRecords(decrypted);
      setKeyReady(true);
      setMessage(failures.length
        ? `Loaded ${decrypted.length} record(s); ${failures.length} could not be decrypted on this device.`
        : `Loaded and decrypted ${decrypted.length} encrypted record(s) on this device.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the encrypted vault.');
    } finally { setBusy(false); }
  };

  const saveRecord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.uid) { setError('Sign in before saving encrypted memory.'); return; }
    if (!keyReady) { setError('First confirm the local Android encryption key.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const now = new Date().toISOString();
      const recordId = makeRecordId();
      const payload: EncryptedMemoryPayload = {
        schemaVersion: 1,
        id: recordId,
        category,
        area,
        title: title.trim(),
        content: content.trim(),
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 30),
        createdAt: now,
        updatedAt: now,
        deleted: false,
      };
      const context = { ownerUid: user.uid, recordId, keyVersion: 1, revision: 1 };
      const encrypted = await encryptMemoryRecordOnAndroid(payload, context);
      const stored = await createEncryptedMemoryRecord(encrypted);
      const verified = await decryptMemoryRecordOnAndroid(stored, context);
      setRecords((current) => [{ ...verified, recordId }, ...current.filter((item) => item.recordId !== recordId)]);
      setTitle(''); setContent(''); setTags('');
      setMessage('Encrypted record saved. Its content was encrypted on this phone before upload and read back locally.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save encrypted memory.');
    } finally { setBusy(false); }
  };

  return (
    <section className="rounded-xl border border-indigo-200 bg-white p-5 space-y-4" aria-labelledby="encrypted-vault-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="encrypted-vault-title" className="text-base font-semibold text-slate-900">Encrypted Memory Vault</h2>
          <p className="mt-1 text-xs text-slate-600">A separate owner-controlled vault. Records are encrypted on this Android device before they reach the server.</p>
        </div>
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-800">Device encryption</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !user} onClick={() => void prepareKey()} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
          Confirm local encryption key
        </button>
        <button type="button" disabled={busy || !user} onClick={() => void loadVault()} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50">
          Load encrypted vault
        </button>
      </div>
      {!user && <p className="text-xs text-amber-700">Sign in to access the owner-scoped encrypted vault.</p>}
      {message && <p className="text-xs text-emerald-700" role="status">{message}</p>}
      {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
      <form onSubmit={(event) => void saveRecord(event)} className="space-y-3 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-800">Add a new encrypted record</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Memory title" aria-label="Encrypted memory title" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select value={category} onChange={(event) => setCategory(event.target.value as MemoryEntry['category'])} aria-label="Encrypted memory category" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="goal">Goal</option><option value="decision">Decision</option><option value="lesson">Lesson</option><option value="preference">Preference</option><option value="workflow">Workflow</option>
          </select>
          <select value={area} onChange={(event) => setArea(event.target.value as JerryMemoryArea)} aria-label="Encrypted memory area" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {AREAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <input value={tags} onChange={(event) => setTags(event.target.value)} maxLength={500} placeholder="Tags, separated by commas" aria-label="Encrypted memory tags" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <textarea required maxLength={20000} rows={3} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write the information Jerry should remember..." aria-label="Encrypted memory content" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" disabled={busy || !keyReady || !user} className="rounded-lg bg-indigo-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? 'Working…' : 'Encrypt and save record'}
        </button>
      </form>
      <div className="border-t border-slate-200 pt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Decrypted records on this device ({visible.length})</h3>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search locally decrypted records" aria-label="Search encrypted vault locally" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs" />
        </div>
        {visible.length === 0 ? <p className="text-xs text-slate-500">No decrypted records loaded. Choose “Load encrypted vault” to fetch and decrypt records on this phone.</p> :
          <div className="divide-y divide-slate-200">
            {visible.map((entry) => <article key={entry.recordId} className="py-3 first:pt-0">
              <p className="text-[11px] text-indigo-700">{entry.area.replaceAll('_', ' ')} · {entry.category} · {entry.createdAt.slice(0, 10)}</p>
              <h4 className="mt-1 text-sm font-semibold text-slate-900">{entry.title}</h4>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{entry.content}</p>
              {entry.tags.length > 0 && <p className="mt-1 text-[11px] text-slate-500">{entry.tags.join(' · ')}</p>}
            </article>)}
          </div>}
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">This vault is separate from existing Jerry memories. It does not import, alter, migrate, or delete legacy plaintext memories. Search operates only on records decrypted locally on this device.</p>
    </section>
  );
}
