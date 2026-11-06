'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** Matches the sample docs in /samples/docs. Replace with cases for your own documents. */
const DEFAULT_CASES = [
  { question: 'How many days do I have to request a refund?', expectedSource: 'refund', expectedText: '14 days' },
  { question: 'Can I get my money back after finishing half the course?', expectedSource: 'refund' },
  { question: 'How long does a refund take to reach my bank?', expectedSource: 'refund', expectedText: '7 business days' },
  { question: 'Are bootcamp fees refundable after the first live session?', expectedSource: 'refund' },
  { question: 'What should a new mentor do in their first week?', expectedSource: 'onboarding' },
  { question: 'Who do I contact for laptop or software access?', expectedSource: 'onboarding', expectedText: 'it-help' },
  { question: 'When is payroll processed?', expectedSource: 'onboarding' },
  { question: 'How fast must a security incident be reported?', expectedSource: 'security', expectedText: '1 hour' },
  { question: 'What are the password requirements?', expectedSource: 'security' },
  { question: 'Is it okay to share student data over WhatsApp?', expectedSource: 'security' },
  { question: 'How often are access reviews done?', expectedSource: 'security' },
  { question: 'Is two-factor authentication mandatory?', expectedSource: 'security' },
];

interface RunResult {
  total: number;
  k: number;
  hitRate: number;
  mrr: number;
  avgLatencyMs: number;
  details: Array<{ question: string; hit: boolean; rank: number | null; latencyMs: number; top: Array<{ title: string }> }>;
}

export default function Evals({ workspaceId }: { workspaceId: string }) {
  const [casesJson, setCasesJson] = useState(JSON.stringify(DEFAULT_CASES, null, 2));
  const [result, setResult] = useState<RunResult | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadHistory = () => api(`/workspaces/${workspaceId}/evals`).then(setHistory).catch(() => undefined);
  useEffect(() => {
    loadHistory();
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    setError('');
    let cases;
    try {
      cases = JSON.parse(casesJson);
    } catch {
      setError('Cases must be valid JSON');
      return;
    }
    setBusy(true);
    try {
      setResult(
        await api(`/workspaces/${workspaceId}/evals`, { method: 'POST', body: JSON.stringify({ cases, k: 5 }) }),
      );
      loadHistory();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row">
          <div>
            <h2 style={{ margin: 0 }}>Retrieval evaluation</h2>
            <p className="muted small" style={{ margin: 0 }}>
              Each case passes if a top-5 passage comes from <code>expectedSource</code> (title match) and contains{' '}
              <code>expectedText</code> when given. Reports hit rate@5 and MRR.
            </p>
          </div>
          <div className="spacer" />
          <button className="primary" onClick={run} disabled={busy}>
            {busy ? 'Running…' : 'Run evals'}
          </button>
        </div>
        <textarea rows={10} value={casesJson} onChange={(e) => setCasesJson(e.target.value)} />
        {error && <p className="error">{error}</p>}
      </div>

      {result && (
        <>
          <div className="grid grid-4">
            <div className="card stat">
              <div className="value">{(result.hitRate * 100).toFixed(0)}%</div>
              <div className="label">Hit rate @{result.k}</div>
            </div>
            <div className="card stat">
              <div className="value">{result.mrr.toFixed(3)}</div>
              <div className="label">MRR</div>
            </div>
            <div className="card stat">
              <div className="value">{result.avgLatencyMs} ms</div>
              <div className="label">Avg retrieval latency</div>
            </div>
            <div className="card stat">
              <div className="value">{result.total}</div>
              <div className="label">Cases</div>
            </div>
          </div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Result</th>
                  <th>Rank</th>
                  <th>Top passage</th>
                </tr>
              </thead>
              <tbody>
                {result.details.map((d, i) => (
                  <tr key={i}>
                    <td>{d.question}</td>
                    <td>
                      <span className={`badge ${d.hit ? 'ready' : 'failed'}`}>{d.hit ? 'hit' : 'miss'}</span>
                    </td>
                    <td>{d.rank ?? '–'}</td>
                    <td className="muted">{d.top[0]?.title ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {history.length > 0 && (
        <div className="card">
          <h2>Previous runs</h2>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Cases</th>
                <th>Hit rate</th>
                <th>MRR</th>
                <th>Avg latency</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.created_at).toLocaleString()}</td>
                  <td>{h.total}</td>
                  <td>{(h.hit_rate * 100).toFixed(0)}%</td>
                  <td>{Number(h.mrr).toFixed(3)}</td>
                  <td>{h.avg_latency_ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
