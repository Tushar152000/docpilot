#!/usr/bin/env node
/**
 * Seeds a demo workspace with the sample docs, waits for ingestion, then runs the eval set.
 * Usage: node scripts/seed.mjs   (API must be running; override with DOCPILOT_API_URL)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = (process.env.DOCPILOT_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function call(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

const health = await call('/health');
console.log(`API ok (mode: ${health.mode}, embeddings: ${health.embeddingModel})`);

const ws = await call('/workspaces', { name: 'Acme Learning (demo)' });
console.log(`Created workspace ${ws.id}`);

const docsDir = join(root, 'samples/docs');
for (const file of readdirSync(docsDir).filter((f) => f.endsWith('.md'))) {
  const text = readFileSync(join(docsDir, file), 'utf8');
  const title = text.match(/^#\s+(.+)$/m)?.[1] ?? file;
  await call(`/workspaces/${ws.id}/documents/text`, { title, text, source: file });
  console.log(`Queued ${file}`);
}

for (let i = 0; i < 60; i++) {
  const docs = await call(`/workspaces/${ws.id}/documents`);
  const pending = docs.filter((d) => d.status === 'queued' || d.status === 'processing');
  const failed = docs.filter((d) => d.status === 'failed');
  if (failed.length) throw new Error(`Ingestion failed: ${failed.map((d) => `${d.title}: ${d.error}`).join('; ')}`);
  if (!pending.length) {
    console.log(`All ${docs.length} documents ready (${docs.reduce((s, d) => s + d.chunk_count, 0)} chunks)`);
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}

const cases = JSON.parse(readFileSync(join(root, 'samples/evals.json'), 'utf8'));
const run = await call(`/workspaces/${ws.id}/evals`, { cases, k: 5 });
console.log(
  `Evals: hit rate@5 ${(run.hitRate * 100).toFixed(0)}%, MRR ${run.mrr.toFixed(3)}, avg latency ${run.avgLatencyMs} ms`,
);
for (const d of run.details.filter((x) => !x.hit)) console.log(`  miss: ${d.question}`);

const answer = await call(`/workspaces/${ws.id}/ask`, { question: 'How long do refunds take to reach my bank?' });
console.log(`\nSample answer:\n${answer.answer}\nSources: ${answer.citations.map((c) => `[${c.n}] ${c.title}`).join(', ')}`);
console.log(`\nOpen http://localhost:3000/w/${ws.id}`);
