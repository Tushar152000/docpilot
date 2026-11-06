'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Workspace {
  id: string;
  name: string;
  created_at: string;
  document_count: number;
}

export default function HomePage() {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [health, setHealth] = useState<{ mode: string; embeddingModel: string } | null>(null);

  const load = () =>
    api<Workspace[]>('/workspaces')
      .then(setWorkspaces)
      .catch((e) => setError(`Cannot reach the API: ${e.message}`));

  useEffect(() => {
    load();
    api('/health').then(setHealth).catch(() => undefined);
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api('/workspaces', { method: 'POST', body: JSON.stringify({ name }) });
      setName('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <div>
          <h1>Workspaces</h1>
          <p className="muted" style={{ margin: 0 }}>
            Each workspace is an isolated knowledge base with its own documents, chat, evals and metrics.
          </p>
        </div>
        <div className="spacer" />
        {health && (
          <span className="badge" title="LLM provider mode">
            mode: {health.mode} · {health.embeddingModel}
          </span>
        )}
      </div>

      <form className="row card" onSubmit={create}>
        <input
          placeholder="New workspace name, e.g. Bosscoder Course Docs"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, width: 'auto' }}
        />
        <button className="primary" type="submit">
          Create workspace
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {workspaces === null ? (
        <p className="muted">Loading…</p>
      ) : workspaces.length === 0 ? (
        <div className="card empty">No workspaces yet. Create one above to get started.</div>
      ) : (
        <div className="grid grid-3">
          {workspaces.map((w) => (
            <Link key={w.id} href={`/w/${w.id}`} className="card" style={{ color: 'inherit' }}>
              <strong>{w.name}</strong>
              <div className="muted small">
                {w.document_count} document{w.document_count === 1 ? '' : 's'} · created{' '}
                {new Date(w.created_at).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
