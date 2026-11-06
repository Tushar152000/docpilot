import * as dotenv from 'dotenv';
import * as path from 'path';

// Local runs read the repo-root .env. Real env vars win, and in Docker (where
// Compose injects the values) the file simply isn't there.
dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

/** Central, typed access to environment configuration. */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://docpilot:docpilot@localhost:5432/docpilot',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  migrationsDir:
    process.env.MIGRATIONS_DIR ?? path.resolve(__dirname, '../../../db/migrations'),

  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiChatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-6-luna',
  openaiEmbedModel: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',

  /** Must match the vector(N) column in the migration. */
  embeddingDims: 1536,
  chunkSize: Number(process.env.CHUNK_SIZE ?? 900),
  chunkOverlap: Number(process.env.CHUNK_OVERLAP ?? 150),
  maxUploadBytes: 20 * 1024 * 1024,
};

/** USD per 1M tokens: [input, output]. Unknown models fall back to 0. */
export const PRICING: Record<string, [number, number]> = {
  'gpt-6-luna': [0.1, 0.5],
  'gpt-5.6-luna': [0.2, 1.2],
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4o': [2.5, 10],
  'gpt-4.1-mini': [0.4, 1.6],
  'text-embedding-3-small': [0.02, 0],
  'claude-3-5-haiku': [0.8, 4],
  'claude-haiku-4-5': [1, 5],
};

export function costUsd(model: string, input: number, output: number): number {
  const key = Object.keys(PRICING).find((k) => model.startsWith(k));
  if (!key) return 0;
  const [inp, out] = PRICING[key];
  return (input * inp + output * out) / 1_000_000;
}
