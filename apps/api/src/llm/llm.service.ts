import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { config } from '../config';
import { hashEmbedding } from './text-utils';

export type LlmMode = 'openai' | 'anthropic' | 'offline';

/**
 * Thin wrapper around the model providers.
 * - Embeddings: OpenAI if a key is set, otherwise deterministic hash embeddings.
 * - Chat: the agent talks to `openai` directly (tool calling + streaming) and
 *   falls back to `anthropic`, then to an offline extractive answer.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  readonly openai = config.openaiKey ? new OpenAI({ apiKey: config.openaiKey }) : null;
  readonly anthropic = config.anthropicKey ? new Anthropic({ apiKey: config.anthropicKey }) : null;

  get mode(): LlmMode {
    if (this.openai) return 'openai';
    if (this.anthropic) return 'anthropic';
    return 'offline';
  }

  get embeddingModel(): string {
    return this.openai ? config.openaiEmbedModel : 'hash-embedding-v1';
  }

  /** Embeds texts in batches. Returns vectors plus tokens used (0 offline). */
  async embed(texts: string[]): Promise<{ vectors: number[][]; tokens: number }> {
    if (!this.openai) {
      return { vectors: texts.map((t) => hashEmbedding(t, config.embeddingDims)), tokens: 0 };
    }
    const vectors: number[][] = [];
    let tokens = 0;
    const batchSize = 96;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize).map((t) => t.slice(0, 8000));
      const res = await this.withRetry(() =>
        this.openai!.embeddings.create({ model: config.openaiEmbedModel, input: batch }),
      );
      res.data.sort((a, b) => a.index - b.index).forEach((d) => vectors.push(d.embedding));
      tokens += res.usage?.total_tokens ?? 0;
    }
    return { vectors, tokens };
  }

  /** Exponential backoff for transient provider errors (429 / 5xx / network). */
  async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const status = err?.status ?? 0;
        const retryable = !status || status === 429 || status >= 500;
        if (!retryable || i === attempts - 1) break;
        const delay = 500 * 2 ** i;
        this.logger.warn(`LLM call failed (${status || err?.message}); retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }
}
