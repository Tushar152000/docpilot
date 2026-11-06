'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function Insights({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/workspaces/${workspaceId}/insights`).then(setData).catch((e) => setError(e.message));
  }, [workspaceId]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const t = data.totals;
  const maxQ = Math.max(1, ...data.daily.map((d: any) => d.queries));
  const stats = [
    { label: 'Queries', value: t.queries },
    { label: 'Total cost', value: `$${t.cost_usd.toFixed(4)}` },
    { label: 'Avg cost / query', value: `$${t.avg_cost_usd.toFixed(5)}` },
    { label: 'p50 latency', value: `${t.p50_latency_ms} ms` },
    { label: 'p95 latency', value: `${t.p95_latency_ms} ms` },
    { label: 'Avg tool calls', value: t.avg_tool_calls.toFixed(1) },
    { label: 'Documents', value: data.documents },
    { label: 'Indexed chunks', value: data.chunks },
  ];

  return (
    <div className="stack">
      <div className="grid grid-4">
        {stats.map((s) => (
          <div key={s.label} className="card stat">
            <div className="value">{s.value}</div>
            <div className="label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Queries per day (last 14 days)</h2>
        {data.daily.length === 0 ? (
          <p className="muted">No queries yet. Ask something in the Chat tab.</p>
        ) : (
          <>
            <div className="bars">
              {data.daily.map((d: any) => (
                <div
                  key={d.day}
                  style={{ height: `${(d.queries / maxQ) * 100}%` }}
                  title={`${d.day}: ${d.queries} queries, $${d.cost_usd.toFixed(4)}, ${d.avg_latency_ms} ms avg`}
                />
              ))}
            </div>
            <div className="row muted small">
              <span>{data.daily[0].day}</span>
              <div className="spacer" />
              <span>{data.daily[data.daily.length - 1].day}</span>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Recent queries</h2>
        <table>
          <thead>
            <tr>
              <th>Question</th>
              <th>Model</th>
              <th>Tokens</th>
              <th>Cost</th>
              <th>Latency</th>
              <th>Tools</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.map((r: any, i: number) => (
              <tr key={i}>
                <td>{r.question}</td>
                <td className="muted">{r.model}</td>
                <td>{r.tokens}</td>
                <td>${r.cost_usd.toFixed(5)}</td>
                <td>{r.latency_ms} ms</td>
                <td>{r.tool_calls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
