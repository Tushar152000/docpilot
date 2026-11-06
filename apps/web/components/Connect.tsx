'use client';

import { API_URL } from '@/lib/api';

export default function Connect({ workspaceId }: { workspaceId: string }) {
  const config = {
    mcpServers: {
      docpilot: {
        command: 'node',
        args: ['/ABSOLUTE/PATH/TO/docpilot/apps/mcp/dist/index.js'],
        env: { DOCPILOT_API_URL: API_URL, DOCPILOT_WORKSPACE_ID: workspaceId },
      },
    },
  };

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Use this workspace from Claude Desktop or Cursor (MCP)</h2>
        <p className="muted" style={{ margin: 0 }}>
          DocPilot ships an MCP server exposing <code>search_docs</code>, <code>ask_docs</code>,{' '}
          <code>list_documents</code> and <code>add_note</code>. Build it once, then add this to your client config.
        </p>
        <ol className="small">
          <li>
            <code>cd apps/mcp &amp;&amp; npm install &amp;&amp; npm run build</code>
          </li>
          <li>
            Claude Desktop: Settings → Developer → Edit Config (<code>claude_desktop_config.json</code>). Cursor:{' '}
            <code>~/.cursor/mcp.json</code>.
          </li>
          <li>Paste the block below, fix the path, and restart the client.</li>
        </ol>
        <pre className="card" style={{ overflowX: 'auto', margin: 0 }}>
          {JSON.stringify(config, null, 2)}
        </pre>
      </div>
      <div className="card">
        <h2>REST API</h2>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{`POST ${API_URL}/workspaces/${workspaceId}/chat     (SSE stream)
POST ${API_URL}/workspaces/${workspaceId}/ask      { "question": "..." }
POST ${API_URL}/workspaces/${workspaceId}/search   { "query": "...", "topK": 6 }
POST ${API_URL}/workspaces/${workspaceId}/documents (multipart "file")`}</pre>
      </div>
    </div>
  );
}
