'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const LOOKS_LIKE_URL = /^(https?:\/\/|www\.)|^[\w-]+\.(com|org|net|io|ai|in|co)(\/|$)/i;

interface Workspace {
  id: string;
  name: string;
  created_at: string;
  document_count: number;
}

export default function HomePage() {
  const router = useRouter();
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
    setError('');
    if (LOOKS_LIKE_URL.test(name.trim())) {
      setError('That looks like a web address. Enter a short name here, then add the page in the Knowledge tab.');
      return;
    }
    try {
      const created = await api<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify({ name }) });
      // A new workspace is empty, so go straight to where documents get added.
      router.push(`/w/${created.id}?tab=Knowledge`);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function remove(w: Workspace) {
    const count = `${w.document_count} document${w.document_count === 1 ? '' : 's'}`;
    if (!window.confirm(`Permanently delete "${w.name}" and its ${count}, chats, evals and tickets?`)) return;
    setError('');
    try {
      await api(`/workspaces/${w.id}`, { method: 'DELETE' });
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
          placeholder="Workspace name, e.g. Bosscoder Course Docs"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, width: 'auto' }}
        />
        <button className="primary" type="submit">
          Create workspace
        </button>
        <p className="muted small" style={{ margin: 0, width: '100%' }}>
          The name is only a label. You&apos;ll add files or web pages in the next step.
        </p>
      </form>

      {error && <p className="error">{error}</p>}

      {workspaces === null ? (
        <p className="muted">Loading…</p>
      ) : workspaces.length === 0 ? (
        <div className="card empty">No workspaces yet. Create one above to get started.</div>
      ) : (
        <div className="grid grid-3">
          {workspaces.map((w) => (
            <div key={w.id} className="card workspace-card">
              <Link href={`/w/${w.id}`} style={{ color: 'inherit', flex: 1 }}>
                <strong>{w.name}</strong>
                <div className="muted small">
                  {w.document_count} document{w.document_count === 1 ? '' : 's'} · created{' '}
                  {new Date(w.created_at).toLocaleDateString()}
                </div>
              </Link>
              <div className="row">
                {w.document_count === 0 && <Link href={`/w/${w.id}?tab=Knowledge`}>Add documents →</Link>}
                <div className="spacer" />
                <button className="link" style={{ color: 'var(--err)' }} onClick={() => remove(w)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
