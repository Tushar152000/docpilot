'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Chat from '@/components/Chat';
import Connect from '@/components/Connect';
import Evals from '@/components/Evals';
import Insights from '@/components/Insights';
import Knowledge from '@/components/Knowledge';
import Tickets from '@/components/Tickets';
import { api } from '@/lib/api';

const TABS = ['Chat', 'Knowledge', 'Evals', 'Insights', 'Tickets', 'Connect (MCP)'] as const;
type Tab = (typeof TABS)[number];

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const requestedTab = useSearchParams().get('tab');
  const [tab, setTab] = useState<Tab>(TABS.find((t) => t === requestedTab) ?? 'Chat');
  const [workspace, setWorkspace] = useState<{ name: string } | null>(null);
  const [documentCount, setDocumentCount] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/workspaces/${id}`).then(setWorkspace).catch((e) => setError(e.message));
  }, [id]);

  // Re-checked on tab change so the notice clears after documents are added in Knowledge.
  useEffect(() => {
    api<unknown[]>(`/workspaces/${id}/documents`)
      .then((docs) => setDocumentCount(docs.length))
      .catch(() => undefined);
  }, [id, tab]);

  if (error) return <p className="error">{error}</p>;

  return (
    <div>
      <h1>{workspace?.name ?? '…'}</h1>
      <p className="muted small" style={{ margin: 0 }}>
        Workspace ID: <code>{id}</code>
      </p>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      {tab === 'Chat' && documentCount === 0 && (
        <div className="card row" style={{ marginBottom: 12 }}>
          <span>This workspace has no documents yet, so there is nothing to search.</span>
          <div className="spacer" />
          <button className="primary" onClick={() => setTab('Knowledge')}>
            Add documents
          </button>
        </div>
      )}
      {tab === 'Chat' && <Chat workspaceId={id} />}
      {tab === 'Knowledge' && <Knowledge workspaceId={id} />}
      {tab === 'Evals' && <Evals workspaceId={id} />}
      {tab === 'Insights' && <Insights workspaceId={id} />}
      {tab === 'Tickets' && <Tickets workspaceId={id} />}
      {tab === 'Connect (MCP)' && <Connect workspaceId={id} />}
    </div>
  );
}
