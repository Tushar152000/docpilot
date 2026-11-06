'use client';

import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AgentEvent, api, Citation, streamChat } from '@/lib/api';

interface ToolStep {
  id: string;
  name: string;
  args: Record<string, unknown>;
  summary?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tools?: ToolStep[];
  citations?: Citation[];
  usage?: Extract<AgentEvent, { type: 'done' }>['usage'];
  model?: string;
  error?: string;
  pending?: boolean;
}

const SUGGESTIONS = [
  'What is the refund policy?',
  'Summarize the onboarding guide',
  'How should I report a security incident?',
];

/**
 * Renders untrusted Markdown from the model or a document. Raw HTML is off by default, and
 * images are dropped so injected text can't make the browser call an outside URL by itself.
 */
function Markdown({ text, onCite }: { text: string; onCite?: (n: number) => void }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={['img']}
        components={{
          a({ href, children }) {
            const cite = href?.match(/^#cite-(\d+)$/);
            if (cite && onCite) {
              return (
                <button type="button" className="cite" onClick={() => onCite(Number(cite[1]))}>
                  {cite[1]}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** Renders an answer, turning [n] markers into clickable citation buttons. */
function AnswerText({ text, onCite }: { text: string; onCite: (n: number) => void }) {
  return <Markdown text={text.replace(/\[(\d+)\](?!\()/g, '[$1](#cite-$1)')} onCite={onCite} />;
}

export default function Chat({ workspaceId }: { workspaceId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<{ title: string; content: string; n: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function patchLast(fn: (m: Message) => Message) {
    setMessages((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);
  }

  async function openSource(citations: Citation[] | undefined, n: number) {
    const c = citations?.find((x) => x.n === n);
    if (!c) return;
    setSource({ title: c.title, content: c.snippet, n });
    try {
      const chunk = await api(`/workspaces/${workspaceId}/chunks/${c.chunkId}`);
      setSource({ title: chunk.title, content: chunk.content, n });
    } catch {
      /* keep snippet */
    }
  }

  async function send(question: string) {
    if (!question.trim() || busy) return;
    const history = messages
      .filter((m) => !m.error && m.content)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
      { role: 'assistant', content: '', tools: [], pending: true },
    ]);
    setInput('');
    setBusy(true);
    abortRef.current = new AbortController();

    try {
      for await (const ev of streamChat(workspaceId, question, history, abortRef.current.signal)) {
        if (ev.type === 'meta') patchLast((m) => ({ ...m, model: ev.model }));
        if (ev.type === 'token') patchLast((m) => ({ ...m, content: m.content + ev.text }));
        if (ev.type === 'tool_call')
          patchLast((m) => ({ ...m, tools: [...(m.tools ?? []), { id: ev.id, name: ev.name, args: ev.args }] }));
        if (ev.type === 'tool_result')
          patchLast((m) => ({
            ...m,
            tools: (m.tools ?? []).map((t) => (t.id === ev.id ? { ...t, summary: ev.summary } : t)),
          }));
        if (ev.type === 'citations') patchLast((m) => ({ ...m, citations: ev.items }));
        if (ev.type === 'error') patchLast((m) => ({ ...m, error: ev.message }));
        if (ev.type === 'done') patchLast((m) => ({ ...m, usage: ev.usage }));
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') patchLast((m) => ({ ...m, error: err.message }));
    } finally {
      patchLast((m) => ({ ...m, pending: false }));
      setBusy(false);
    }
  }

  return (
    <div className={`chat ${source ? 'with-source' : ''}`}>
      <div>
        <div className="messages">
          {messages.length === 0 && (
            <div className="card empty">
              <p>Ask anything about this workspace&apos;s documents. Answers come with clickable sources.</p>
              <div className="row" style={{ justifyContent: 'center' }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="msg user">
                {m.content}
              </div>
            ) : (
              <div key={i} className="msg assistant card">
                {m.tools?.map((t) => (
                  <div key={t.id} className="tool">
                    <span className="name">{t.name}</span>({JSON.stringify(t.args)})
                    {t.summary ? <span className="muted"> → {t.summary}</span> : <span className="muted"> …</span>}
                  </div>
                ))}
                {m.content ? (
                  <AnswerText text={m.content} onCite={(n) => openSource(m.citations, n)} />
                ) : (
                  m.pending && <span className="muted">Thinking…</span>
                )}
                {m.error && <p className="error">{m.error}</p>}
                {m.citations && m.citations.length > 0 && (
                  <div className="sources">
                    {m.citations.map((c) => (
                      <button key={c.n} className="source-chip" onClick={() => openSource(m.citations, c.n)}>
                        [{c.n}] {c.title}
                      </button>
                    ))}
                  </div>
                )}
                {m.usage && (
                  <div className="meta">
                    {m.usage.model} · {m.usage.promptTokens + m.usage.completionTokens} tokens · $
                    {m.usage.costUsd.toFixed(5)} · {m.usage.latencyMs} ms · {m.usage.toolCalls} tool call
                    {m.usage.toolCalls === 1 ? '' : 's'}
                  </div>
                )}
              </div>
            ),
          )}
        </div>

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question, or e.g. “Summarize the refund policy and create a ticket to update it”"
            disabled={busy}
          />
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()}>
              Stop
            </button>
          ) : (
            <button className="primary" type="submit" disabled={!input.trim()}>
              Send
            </button>
          )}
        </form>
      </div>

      {source && (
        <aside className="card source-panel">
          <div className="row">
            <strong>
              [{source.n}] {source.title}
            </strong>
            <div className="spacer" />
            <button className="link" onClick={() => setSource(null)}>
              Close
            </button>
          </div>
          <div className="source-text">
            <Markdown text={source.content} />
          </div>
        </aside>
      )}
    </div>
  );
}
