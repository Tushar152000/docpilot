'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function Tickets({ workspaceId }: { workspaceId: string }) {
  const [tickets, setTickets] = useState<any[] | null>(null);

  useEffect(() => {
    api(`/workspaces/${workspaceId}/tickets`).then(setTickets).catch(() => setTickets([]));
  }, [workspaceId]);

  if (!tickets) return <p className="muted">Loading…</p>;
  return (
    <div className="card">
      <h2>Tickets created by the agent</h2>
      {tickets.length === 0 ? (
        <p className="muted">
          None yet. Try asking in Chat: “Summarize the refund policy and create a ticket to clarify bootcamp refunds.”
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Description</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id}>
                <td>{t.title}</td>
                <td className="muted">{t.description}</td>
                <td>
                  <span className="badge">{t.status}</span>
                </td>
                <td className="muted">{new Date(t.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
