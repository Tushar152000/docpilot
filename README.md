# DocPilot

**Open-source agentic RAG platform.** Upload documents or URLs and get an AI agent that answers with **clickable citations**, calls tools, reports its own **cost and latency**, is measured by a built-in **retrieval eval suite**, and plugs into Claude Desktop / Cursor through an **MCP server**.

> Built by [Tushar Chauhan](https://github.com/Tushar152000) · NestJS · Next.js · PostgreSQL + pgvector · BullMQ/Redis · OpenAI / Anthropic · MCP

<!-- Add after recording: [▶ 2-minute demo](https://www.loom.com/...) · [Live demo](https://...) -->

---

## Features

| | |
|---|---|
| **Ingestion pipeline** | PDF, Markdown, TXT, HTML and web URLs → parse → paragraph-aware chunking with overlap → batched embeddings, all in **BullMQ background jobs** with retries, exponential backoff and live progress. Jobs are idempotent, so retries never duplicate chunks. |
| **Hybrid retrieval** | **pgvector** cosine search + **Postgres full-text search**, fused with **Reciprocal Rank Fusion** in a single SQL query. Dense search catches paraphrases; keyword search catches exact names, IDs and numbers. |
| **Agent with tools** | Streaming tool-calling loop (`search_docs`, `summarize_doc`, `list_documents`, `create_ticket`) with a step limit, prompt-injection-aware system prompt and stable citation numbering across tool calls. |
| **Cited answers** | Answers stream over **SSE**; every `[n]` is a button that opens the exact source passage. |
| **Provider fallback** | OpenAI (tools + streaming) → Anthropic (RAG) → **offline mode** (hash embeddings + extractive answers), so the app runs end to end even with no API keys. |
| **Evals** | Hit rate@k and **MRR** over a question set, with per-case results and run history. Sample set included. |
| **Observability** | Tokens, **cost per query**, p50/p95 latency and tool calls per query, logged for every request and charted in the Insights tab. |
| **MCP server** | `search_docs`, `ask_docs`, `list_documents`, `add_note`, `list_workspaces`, usable from Claude Desktop, Cursor or any MCP client. |
| **Multi-workspace** | Each workspace is an isolated knowledge base (documents, chunks, chats, tickets, evals). |

## Architecture

```
┌──────────────┐  REST + SSE  ┌───────────────────────────────────────────────┐
│ Next.js UI   │─────────────►│ NestJS API                                    │
│ chat, upload,│              │  ├─ Documents ──► BullMQ queue ──► Ingestion   │
│ evals, stats │              │  │               (Redis)          worker      │
└──────────────┘              │  │                    parse → chunk → embed   │
                              │  ├─ Agent: tool loop, streaming, fallback     │
┌──────────────┐  HTTP        │  ├─ Retrieval: pgvector + FTS + RRF           │
│ MCP server   │─────────────►│  ├─ Evals: hit rate@k, MRR                    │
│ (stdio)      │              │  └─ Insights: cost / latency / tokens         │
└──────▲───────┘              └───────────────┬───────────────────────────────┘
       │ Claude Desktop / Cursor               │
                                      ┌────────▼────────┐   ┌──────────────┐
                                      │ PostgreSQL 16 + │   │ OpenAI /     │
                                      │ pgvector (HNSW) │   │ Anthropic    │
                                      └─────────────────┘   └──────────────┘
```

### Design decisions

- **pgvector over a separate vector DB.** One datastore for documents, chunks, logs and vectors; transactional re-indexing; hybrid search in one query. A dedicated vector DB is worth it at much larger scale.
- **RRF instead of score blending.** Cosine distances and `ts_rank` live on different scales; RRF only uses ranks, so it needs no tuning and is robust.
- **Chunking at 900 chars with 150 overlap.** Paragraph-first, then sentence-level splitting, so passages stay coherent and citations stay readable.
- **Queue-based ingestion.** Uploads return immediately; large PDFs and slow URLs never block the API, and failures retry with backoff.
- **Text extracted at upload, URLs fetched in the worker.** Keeps Redis job payloads tiny (just a document ID).
- **Graceful degradation.** A provider outage falls back to the next provider before any token is streamed.

## Quick start (Docker)

```bash
cp .env.example .env          # add OPENAI_API_KEY (optional: runs offline without it)
docker compose up --build     # Postgres+pgvector, Redis, API (:4000), web (:3000)
node scripts/seed.mjs         # demo workspace + sample docs + eval run
```

Open **http://localhost:3000**.

### Local development (without Docker for the apps)

```bash
npm run infra                 # just Postgres + Redis in Docker
npm run install:all
npm run dev:api               # http://localhost:4000
npm run dev:web               # http://localhost:3000
npm test                      # unit tests (chunking, embeddings, RRF, tsquery)
```

## Connect from Claude Desktop / Cursor (MCP)

```bash
npm run build:mcp
```

Add to `claude_desktop_config.json` (Claude Desktop → Settings → Developer → Edit Config) or `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "docpilot": {
      "command": "node",
      "args": ["/absolute/path/to/docpilot/apps/mcp/dist/index.js"],
      "env": {
        "DOCPILOT_API_URL": "http://localhost:4000",
        "DOCPILOT_WORKSPACE_ID": "<workspace id from the UI>"
      }
    }
  }
}
```

Then ask Claude: *"Use docpilot to find our refund timelines."*

## API

| Method | Path | |
|---|---|---|
| `GET/POST` | `/workspaces` | list / create |
| `POST` | `/workspaces/:id/documents` | upload (`multipart`, field `file`) |
| `POST` | `/workspaces/:id/documents/url` | `{ "url": "https://..." }` |
| `POST` | `/workspaces/:id/documents/text` | `{ "title", "text" }` |
| `POST` | `/workspaces/:id/chat` | SSE stream of agent events |
| `POST` | `/workspaces/:id/ask` | same agent, JSON response |
| `POST` | `/workspaces/:id/search` | raw hybrid search results |
| `POST` | `/workspaces/:id/evals` | run evals `{ "cases": [...], "k": 5 }` |
| `GET` | `/workspaces/:id/insights` | cost, latency, usage |
| `GET` | `/health` | provider mode |

## Results on the sample set

Measured with `node scripts/seed.mjs` on the 3 sample docs and 12 questions in `samples/evals.json`:

| Mode | Hit rate@5 | MRR |
|---|---|---|
| Offline (hash embeddings + keyword) | 100% | 0.92 |
| OpenAI `text-embedding-3-small` | _run the seed script and fill in_ | |

## Roadmap

- [ ] Auth + per-user workspaces and API keys with rate limiting
- [ ] Semantic answer cache (Redis) with cost-saved metric
- [ ] LLM re-ranking stage and answer-faithfulness evals (LLM-as-judge) in CI
- [ ] LangGraph agent with checkpoints and human-in-the-loop review
- [ ] Connectors: Notion, Google Drive, GitHub with scheduled re-sync
- [ ] Voice mode (Whisper + TTS) and a WhatsApp channel
- [ ] OpenTelemetry / Langfuse tracing

## License

MIT
