export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init?.headers
        : { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? message;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  return res.json();
}

export interface Citation {
  n: number;
  chunkId: string;
  documentId: string;
  title: string;
  source: string | null;
  snippet: string;
}

export type AgentEvent =
  | { type: 'meta'; mode: string; model: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; summary: string }
  | { type: 'token'; text: string }
  | { type: 'citations'; items: Citation[] }
  | { type: 'error'; message: string }
  | {
      type: 'done';
      usage: {
        model: string;
        promptTokens: number;
        completionTokens: number;
        costUsd: number;
        latencyMs: number;
        toolCalls: number;
      };
    };

/** POSTs a question and yields Server-Sent Events from the agent. */
export async function* streamChat(
  workspaceId: string,
  question: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  const res = await fetch(`${API_URL}/workspaces/${workspaceId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Chat failed: HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = frame
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6))
        .join('\n');
      if (data) yield JSON.parse(data) as AgentEvent;
    }
  }
}
