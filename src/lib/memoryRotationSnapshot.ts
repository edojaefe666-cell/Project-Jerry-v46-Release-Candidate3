export interface MemoryRotationSnapshotRecord {
  ordinal: number;
  recordId: string;
  keyVersion: number;
  revision: number;
  createdAt: string;
}

export interface MemoryRotationSnapshotManifest {
  fromKeyVersion: number;
  totalRecords: number;
  manifestSha256: string;
  records: MemoryRotationSnapshotRecord[];
}

function isCanonicalIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

/** Verifies a complete ordered manifest exactly as the server seals it. */
export async function verifyMemoryRotationSnapshotManifest(
  manifest: MemoryRotationSnapshotManifest,
  cryptoProvider: Crypto = globalThis.crypto,
): Promise<boolean> {
  try {
    if (!manifest || !Number.isSafeInteger(manifest.fromKeyVersion) || manifest.fromKeyVersion < 1 ||
        !Number.isSafeInteger(manifest.totalRecords) || manifest.totalRecords < 0 ||
        manifest.totalRecords > 100_000 || !Array.isArray(manifest.records) ||
        manifest.records.length !== manifest.totalRecords ||
        typeof manifest.manifestSha256 !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(manifest.manifestSha256)) {
      return false;
    }
    const seen = new Set<string>();
    for (let i = 0; i < manifest.records.length; i += 1) {
      const record = manifest.records[i];
      if (!record || record.ordinal !== i ||
          typeof record.recordId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(record.recordId) ||
          seen.has(record.recordId) || record.keyVersion !== manifest.fromKeyVersion ||
          !Number.isSafeInteger(record.revision) || record.revision < 1 ||
          !isCanonicalIso(record.createdAt)) return false;
      seen.add(record.recordId);
    }
    const canonical = JSON.stringify(manifest.records.map(record => ({
      ordinal: record.ordinal,
      recordId: record.recordId,
      keyVersion: record.keyVersion,
      revision: record.revision,
      createdAt: record.createdAt,
    })));
    const digest = new Uint8Array(await cryptoProvider.subtle.digest(
      'SHA-256', new TextEncoder().encode(canonical),
    ));
    return toBase64Url(digest) === manifest.manifestSha256;
  } catch {
    return false;
  }
}
