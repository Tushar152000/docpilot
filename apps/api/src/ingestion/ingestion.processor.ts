import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { config } from '../config';
import { DbService, toVector } from '../db/db.service';
import { LlmService } from '../llm/llm.service';
import { chunkText } from '../llm/text-utils';
import { fetchUrl } from './parser';

export const INGEST_QUEUE = 'ingest';
export interface IngestJob {
  documentId: string;
}

/**
 * Background pipeline: (fetch) -> chunk -> embed -> store.
 * Idempotent: re-running a job replaces the document's chunks, so BullMQ retries are safe.
 */
@Processor(INGEST_QUEUE, { concurrency: 2 })
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly db: DbService,
    private readonly llm: LlmService,
  ) {
    super();
  }

  async process(job: Job<IngestJob>): Promise<{ chunks: number }> {
    const { documentId } = job.data;
    const doc = await this.db.one(
      'SELECT id, workspace_id, title, source_type, source_uri, raw_text FROM documents WHERE id = $1',
      [documentId],
    );
    if (!doc) return { chunks: 0 }; // deleted while queued

    await this.setStatus(documentId, 'processing', 5);

    let text: string = doc.raw_text ?? '';
    if (doc.source_type === 'url' && !text) {
      const page = await fetchUrl(doc.source_uri);
      text = page.text;
      await this.db.query(
        `UPDATE documents SET raw_text = $2,
                title = CASE WHEN title = source_uri THEN $3 ELSE title END
          WHERE id = $1`,
        [documentId, text, page.title.slice(0, 200)],
      );
    }

    const chunks = chunkText(text, config.chunkSize, config.chunkOverlap);
    if (chunks.length === 0) throw new Error('No extractable text found in this document');
    await this.setStatus(documentId, 'processing', 20);

    // Embed in slices so we can report progress on large documents.
    const vectors: number[][] = [];
    const slice = 64;
    for (let i = 0; i < chunks.length; i += slice) {
      const { vectors: v } = await this.llm.embed(chunks.slice(i, i + slice));
      vectors.push(...v);
      const pct = 20 + Math.round((70 * Math.min(i + slice, chunks.length)) / chunks.length);
      await this.setStatus(documentId, 'processing', pct);
      await job.updateProgress(pct);
    }

    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM chunks WHERE document_id = $1', [documentId]);
      for (let i = 0; i < chunks.length; i++) {
        await client.query(
          `INSERT INTO chunks (workspace_id, document_id, ordinal, content, embedding)
           VALUES ($1, $2, $3, $4, $5::vector)`,
          [doc.workspace_id, documentId, i, chunks[i], toVector(vectors[i])],
        );
      }
      await client.query(
        `UPDATE documents SET status = 'ready', progress = 100, error = NULL,
                chunk_count = $2, updated_at = now() WHERE id = $1`,
        [documentId, chunks.length],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    this.logger.log(`Indexed "${doc.title}" -> ${chunks.length} chunks`);
    return { chunks: chunks.length };
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<IngestJob> | undefined, err: Error) {
    if (!job) return;
    const finalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
    this.logger.error(`Ingestion failed (attempt ${job.attemptsMade}): ${err.message}`);
    if (finalAttempt) {
      await this.db.query(
        `UPDATE documents SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
        [job.data.documentId, err.message.slice(0, 500)],
      );
    }
  }

  private setStatus(id: string, status: string, progress: number) {
    return this.db.query(
      'UPDATE documents SET status = $2, progress = $3, updated_at = now() WHERE id = $1',
      [id, status, progress],
    );
  }
}
