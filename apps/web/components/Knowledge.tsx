'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Doc {
  id: string;
  title: string;
  source_type: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  progress: number;
  error: string | null;
  chunk_count: number;
  created_at: string;
}

export default function Knowledge({ workspaceId }: { workspaceId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(
    () => api<Doc[]>(`/workspaces/${workspaceId}/documents`).then(setDocs).catch((e) => setError(e.message)),
    [workspaceId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Poll while anything is still being ingested.
  useEffect(() => {
    if (!docs.some((d) => d.status === 'queued' || d.status === 'processing')) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [docs, load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError('');
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      try {
        await api(`/workspaces/${workspaceId}/documents`, { method: 'POST', body: form });
      } catch (e: any) {
        setError(`${file.name}: ${e.message}`);
      }
    }
    setUploading(false);
    load();
  }

  async function addUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    try {
      await api(`/workspaces/${workspaceId}/documents/url`, { method: 'POST', body: JSON.stringify({ url }) });
      setUrl('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function action(doc: Doc, kind: 'reindex' | 'delete') {
    const path = `/workspaces/${workspaceId}/documents/${doc.id}${kind === 'reindex' ? '/reindex' : ''}`;
    await api(path, { method: kind === 'reindex' ? 'POST' : 'DELETE' }).catch((e) => setError(e.message));
    load();
  }

  return (
    <div className="stack">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <label className="card" style={{ cursor: 'pointer' }}>
          <strong>Upload files</strong>
          <p className="muted small">PDF, Markdown, TXT or HTML, up to 20 MB each. Processed in the background.</p>
          <input
            type="file"
            multiple
            accept=".pdf,.md,.markdown,.txt,.html,.htm,.csv,.json"
            onChange={(e) => upload(e.target.files)}
            disabled={uploading}
          />
        </label>
        <form className="card" onSubmit={addUrl}>
          <strong>Add a web page</strong>
          <p className="muted small">We fetch the page, strip navigation, and index the text.</p>
          <div className="row">
            <input
              placeholder="https://docs.example.com/refund-policy"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={{ flex: 1, width: 'auto' }}
            />
            <button className="primary" type="submit">
              Add URL
            </button>
          </div>
        </form>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card">
        <h2>Documents ({docs.length})</h2>
        {docs.length === 0 ? (
          <p className="muted">No documents yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Chunks</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.title}
                    {d.error && <div className="error small">{d.error}</div>}
                  </td>
                  <td className="muted">{d.source_type}</td>
                  <td style={{ minWidth: 120 }}>
                    <span className={`badge ${d.status}`}>{d.status}</span>
                    {(d.status === 'processing' || d.status === 'queued') && (
                      <div className="progress">
                        <div style={{ width: `${d.progress}%` }} />
                      </div>
                    )}
                  </td>
                  <td>{d.chunk_count}</td>
                  <td className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="link" onClick={() => action(d, 'reindex')}>
                      Reindex
                    </button>
                    <button className="link" style={{ color: 'var(--err)' }} onClick={() => action(d, 'delete')}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
