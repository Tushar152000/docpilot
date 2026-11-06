#!/usr/bin/env node
/**
 * DocPilot MCP server (stdio).
 * Lets Claude Desktop, Cursor or any MCP client search and question a DocPilot workspace.
 *
 * Env:
 *   DOCPILOT_API_URL       default http://localhost:4000
 *   DOCPILOT_WORKSPACE_ID  default workspace (tools also accept workspace_id)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_URL = (process.env.DOCPILOT_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const DEFAULT_WORKSPACE = process.env.DOCPILOT_WORKSPACE_ID ?? '';

async function call<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DocPilot API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function workspace(id?: string): string {
  const ws = id || DEFAULT_WORKSPACE;
  if (!ws) throw new Error('No workspace: pass workspace_id or set DOCPILOT_WORKSPACE_ID (see list_workspaces).');
  return ws;
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const fail = (err: unknown) => ({
  content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
  isError: true,
});

const server = new McpServer({ name: 'docpilot', version: '0.1.0' });

server.tool('list_workspaces', 'List DocPilot workspaces (knowledge bases) and their IDs.', {}, async () => {
  try {
    const rows = await call<any[]>('/workspaces');
    return text(rows.map((w) => `- ${w.name} (id: ${w.id}, ${w.document_count} docs)`).join('\n') || 'No workspaces.');
  } catch (e) {
    return fail(e);
  }
});

server.tool(
  'list_documents',
  'List documents in a DocPilot workspace with their indexing status.',
  { workspace_id: z.string().uuid().optional() },
  async ({ workspace_id }) => {
    try {
      const docs = await call<any[]>(`/workspaces/${workspace(workspace_id)}/documents`);
      return text(docs.map((d) => `- ${d.title} [${d.status}, ${d.chunk_count} chunks]`).join('\n') || 'No documents.');
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'search_docs',
  'Hybrid semantic + keyword search over a DocPilot workspace. Returns the most relevant passages with sources.',
  {
    query: z.string().min(2).describe('What to search for'),
    top_k: z.number().int().min(1).max(10).optional(),
    workspace_id: z.string().uuid().optional(),
  },
  async ({ query, top_k, workspace_id }) => {
    try {
      const hits = await call<any[]>(`/workspaces/${workspace(workspace_id)}/search`, { query, topK: top_k ?? 5 });
      if (!hits.length) return text('No matching passages.');
      return text(
        hits
          .map((h, i) => `[${i + 1}] ${h.title} (score ${h.score.toFixed(4)})\n${h.content}`)
          .join('\n\n---\n\n'),
      );
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'ask_docs',
  "Ask DocPilot's agent a question. It searches the workspace and returns a cited answer.",
  { question: z.string().min(2), workspace_id: z.string().uuid().optional() },
  async ({ question, workspace_id }) => {
    try {
      const res = await call<any>(`/workspaces/${workspace(workspace_id)}/ask`, { question });
      const sources = (res.citations ?? []).map((c: any) => `[${c.n}] ${c.title}`).join('\n');
      return text(`${res.answer}\n\nSources:\n${sources || '(none)'}`);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'add_note',
  'Add a text note to a DocPilot workspace so it becomes searchable.',
  {
    title: z.string().min(1).max(200),
    text: z.string().min(1),
    workspace_id: z.string().uuid().optional(),
  },
  async ({ title, text: body, workspace_id }) => {
    try {
      const doc = await call<any>(`/workspaces/${workspace(workspace_id)}/documents/text`, { title, text: body });
      return text(`Added "${doc.title}" (id ${doc.id}); it will be searchable in a few seconds.`);
    } catch (e) {
      return fail(e);
    }
  },
);

await server.connect(new StdioServerTransport());
console.error(`DocPilot MCP server running (API ${API_URL})`);
