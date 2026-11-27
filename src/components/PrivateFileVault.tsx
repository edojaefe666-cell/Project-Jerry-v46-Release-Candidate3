import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Download, FileText, RefreshCw, UploadCloud } from 'lucide-react';
import { apiFetch } from '../lib/apiClient';

type StoredFile = {
  id: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PrivateFileVault() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/storage/files');
      const payload = await response.json() as { files?: StoredFile[]; error?: string };
      if (!response.ok || !Array.isArray(payload.files)) {
        throw new Error(payload.error || 'Private file list is unavailable.');
      }
      setFiles(payload.files);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Private file list is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const handleChooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] ?? null);
    setMessage(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    if (selectedFile.size < 1 || selectedFile.size > 8 * 1024 * 1024) {
      setMessage('Choose a file smaller than 8 MB.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'].includes(selectedFile.type)) {
      setMessage('Supported formats: JPEG, PNG, WebP, PDF and plain text.');
      return;
    }
    setBusy(true);
    setMessage('Uploading privately…');
    try {
      const response = await apiFetch('/api/storage/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Jerry-File-Type': selectedFile.type,
        },
        body: selectedFile,
      });
      const payload = await response.json() as { error?: string; stored?: boolean };
      if (!response.ok || !payload.stored) {
        throw new Error(payload.error || 'Private upload was not confirmed.');
      }
      setSelectedFile(null);
      setMessage('File stored in your private Jerry vault.');
      await loadFiles();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Private upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (objectKey: string) => {
    setMessage(null);
    try {
      const response = await apiFetch('/api/storage/download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectKey }),
      });
      const payload = await response.json() as { url?: string; error?: string };
      if (!response.ok || !payload.url || !/^https:\/\//.test(payload.url)) {
        throw new Error(payload.error || 'A private download link could not be created.');
      }
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Private download failed.');
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Jerry Private File Vault</h2>
          <p className="mt-1 text-xs text-slate-500">Owner-only storage for attachments and documents. Files are private and download links expire after two minutes.</p>
        </div>
        <button type="button" onClick={() => void loadFiles()} disabled={loading} aria-label="Refresh private files" className="rounded-lg border border-slate-300 p-2 text-slate-600 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
          onChange={handleChooseFile}
          aria-label="Choose a private file"
          className="min-w-0 flex-1 text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700"
        />
        <button type="button" onClick={() => void handleUpload()} disabled={!selectedFile || busy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white disabled:opacity-40">
          <UploadCloud className="h-4 w-4" /> {busy ? 'Uploading…' : 'Upload privately'}
        </button>
      </div>
      {selectedFile && <p className="text-xs text-slate-500">Selected: {selectedFile.name} · {formatBytes(selectedFile.size)}</p>}
      {message && <p className="text-xs text-slate-600" role="status">{message}</p>}

      <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
        {loading && files.length === 0 ? (
          <p className="p-3 text-xs text-slate-500">Loading private files…</p>
        ) : files.length === 0 ? (
          <p className="p-3 text-xs text-slate-500">No files stored yet.</p>
        ) : files.map((file) => (
          <div key={file.id} className="flex items-center justify-between gap-3 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-800">Jerry file · {file.id.slice(0, 8)}</p>
                <p className="text-[11px] text-slate-500">{file.contentType} · {formatBytes(file.byteSize)} · {new Date(file.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
            <button type="button" onClick={() => void handleDownload(file.objectKey)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700">
              <Download className="h-3.5 w-3.5" /> Download
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
