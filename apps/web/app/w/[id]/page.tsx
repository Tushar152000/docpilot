'use client';

import { useParams } from 'next/navigation';
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
  const [tab, setTab] = useState<Tab>('Chat');
  const [workspace, setWorkspace] = useState<{ name: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/workspaces/${id}`).then(setWorkspace).catch((e) => setError(e.message));
  }, [id]);

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

      {tab === 'Chat' && <Chat workspaceId={id} />}
      {tab === 'Knowledge' && <Knowledge workspaceId={id} />}
      {tab === 'Evals' && <Evals workspaceId={id} />}
      {tab === 'Insights' && <Insights workspaceId={id} />}
      {tab === 'Tickets' && <Tickets workspaceId={id} />}
      {tab === 'Connect (MCP)' && <Connect workspaceId={id} />}
    </div>
  );
}
