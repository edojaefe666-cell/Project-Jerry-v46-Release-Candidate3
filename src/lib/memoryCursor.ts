export interface MemoryPageCursor {
  createdAt: string;
  id: string;
}

/** Opaque, versioned cursor for stable descending (createdAt, id) pagination. */
export function encodeMemoryPageCursor(cursor: MemoryPageCursor): string {
  return Buffer.from(JSON.stringify({ v: 1, createdAt: cursor.createdAt, id: cursor.id }), 'utf8').toString('base64url');
}

export function decodeMemoryPageCursor(value: unknown): MemoryPageCursor | null {
  if (typeof value !== 'string' || value.length < 8 || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (parsed.v !== 1 || typeof parsed.createdAt !== 'string' || Number.isNaN(Date.parse(parsed.createdAt))) return null;
    if (typeof parsed.id !== 'string' || !parsed.id.trim() || parsed.id.length > 160) return null;
    return { createdAt: new Date(parsed.createdAt).toISOString(), id: parsed.id };
  } catch {
    return null;
  }
}

export interface EncryptedMemorySnapshotCursor {
  snapshotAt: string;
  lastCreatedAt: string;
  lastId: string;
}

/** Cursor pins every page to an immutable creation-time watermark. */
export function encodeEncryptedMemorySnapshotCursor(cursor: EncryptedMemorySnapshotCursor): string {
  if (!isValidEncryptedSnapshotCursor(cursor)) throw new Error('Encrypted memory snapshot cursor is invalid.');
  return Buffer.from(JSON.stringify({ v: 2, ...cursor }), 'utf8').toString('base64url');
}

export function decodeEncryptedMemorySnapshotCursor(value: unknown): EncryptedMemorySnapshotCursor | null {
  if (typeof value !== 'string' || value.length < 8 || value.length > 768 ||
      !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (parsed.v !== 2) return null;
    const cursor = { snapshotAt: parsed.snapshotAt, lastCreatedAt: parsed.lastCreatedAt, lastId: parsed.lastId };
    return isValidEncryptedSnapshotCursor(cursor) ? cursor : null;
  } catch { return null; }
}

function isValidEncryptedSnapshotCursor(value: unknown): value is EncryptedMemorySnapshotCursor {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const validDate = (x: unknown): x is string => typeof x === 'string' && !Number.isNaN(Date.parse(x)) &&
    new Date(x).toISOString() === x;
  if (!Object.keys(v).every(k => ['snapshotAt','lastCreatedAt','lastId'].includes(k)) ||
      !validDate(v.snapshotAt) || !validDate(v.lastCreatedAt) ||
      typeof v.lastId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(v.lastId)) return false;
  return Date.parse(v.lastCreatedAt) <= Date.parse(v.snapshotAt);
}
