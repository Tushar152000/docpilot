import { Injectable } from '@nestjs/common';
import { DbService, toVector } from '../db/db.service';
import { LlmService } from '../llm/llm.service';
import { toOrTsQuery } from '../llm/text-utils';

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  title: string;
  source: string | null;
  ordinal: number;
  content: string;
  score: number;
  vectorRank: number | null;
  keywordRank: number | null;
}

/**
 * Hybrid retrieval: pgvector cosine search + Postgres full-text search,
 * merged with Reciprocal Rank Fusion (RRF) in a single SQL round trip.
 * Dense search catches paraphrases; keyword search catches exact terms,
 * names and IDs that embeddings often miss.
 */
@Injectable()
export class RetrievalService {
  constructor(
    private readonly db: DbService,
    private readonly llm: LlmService,
  ) {}

  async search(workspaceId: string, query: string, topK = 6, candidates = 20): Promise<RetrievedChunk[]> {
    const {
      vectors: [embedding],
    } = await this.llm.embed([query]);
    const tsQuery = toOrTsQuery(query);

    const rows = await this.db.query(
      `WITH vec AS (
         SELECT id, row_number() OVER (ORDER BY embedding <=> $2::vector) AS rank
           FROM chunks
          WHERE workspace_id = $1
          ORDER BY embedding <=> $2::vector
          LIMIT $4
       ),
       kw AS (
         SELECT id, row_number() OVER (ORDER BY ts_rank_cd(tsv, q) DESC) AS rank
           FROM chunks, to_tsquery('english', $3) q
          WHERE workspace_id = $1 AND $3 <> '' AND tsv @@ q
          ORDER BY ts_rank_cd(tsv, q) DESC
          LIMIT $4
       )
       SELECT c.id AS chunk_id, c.document_id, c.ordinal, c.content,
              d.title, d.source_uri,
              vec.rank AS vector_rank, kw.rank AS keyword_rank,
              COALESCE(1.0 / (60 + vec.rank), 0) + COALESCE(1.0 / (60 + kw.rank), 0) AS score
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
         LEFT JOIN vec ON vec.id = c.id
         LEFT JOIN kw ON kw.id = c.id
        WHERE vec.id IS NOT NULL OR kw.id IS NOT NULL
        ORDER BY score DESC
        LIMIT $5`,
      [workspaceId, toVector(embedding), tsQuery, candidates, topK],
    );

    return rows.map((r) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      title: r.title,
      source: r.source_uri,
      ordinal: r.ordinal,
      content: r.content,
      score: Number(r.score),
      vectorRank: r.vector_rank === null ? null : Number(r.vector_rank),
      keywordRank: r.keyword_rank === null ? null : Number(r.keyword_rank),
    }));
  }

  /** First N chunks of a document, used by the summarize tool. */
  async documentByTitle(workspaceId: string, title: string, maxChunks = 12) {
    const doc = await this.db.one(
      `SELECT id, title FROM documents
        WHERE workspace_id = $1 AND status = 'ready' AND title ILIKE $2
        ORDER BY length(title) ASC LIMIT 1`,
      [workspaceId, `%${title}%`],
    );
    if (!doc) return null;
    const chunks = await this.db.query(
      `SELECT id, ordinal, content FROM chunks WHERE document_id = $1 ORDER BY ordinal LIMIT $2`,
      [doc.id, maxChunks],
    );
    return { id: doc.id as string, title: doc.title as string, chunks };
  }

  listDocuments(workspaceId: string) {
    return this.db.query(
      `SELECT id, title, source_type, status, chunk_count FROM documents
        WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId],
    );
  }
}
