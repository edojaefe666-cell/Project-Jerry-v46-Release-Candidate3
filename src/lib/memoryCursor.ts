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
