import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { DbService } from '../db/db.service';

/** Usage, cost and latency metrics + tickets for a workspace. */
@Controller('workspaces/:workspaceId')
export class InsightsController {
  constructor(private readonly db: DbService) {}

  @Get('insights')
  async insights(@Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    const totals = await this.db.one(
      `SELECT count(*)::int AS queries,
              COALESCE(sum(prompt_tokens + completion_tokens), 0)::int AS tokens,
              COALESCE(sum(cost_usd), 0)::float AS cost_usd,
              COALESCE(avg(cost_usd), 0)::float AS avg_cost_usd,
              COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms), 0)::int AS p50_latency_ms,
              COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::int AS p95_latency_ms,
              COALESCE(avg(tool_calls), 0)::float AS avg_tool_calls
         FROM query_logs WHERE workspace_id = $1`,
      [workspaceId],
    );
    const daily = await this.db.query(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
              count(*)::int AS queries,
              COALESCE(sum(cost_usd), 0)::float AS cost_usd,
              COALESCE(avg(latency_ms), 0)::int AS avg_latency_ms
         FROM query_logs
        WHERE workspace_id = $1 AND created_at > now() - interval '14 days'
        GROUP BY 1 ORDER BY 1`,
      [workspaceId],
    );
    const recent = await this.db.query(
      `SELECT question, model, prompt_tokens + completion_tokens AS tokens, cost_usd::float,
              latency_ms, tool_calls, created_at
         FROM query_logs WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [workspaceId],
    );
    const docs = await this.db.one(
      `SELECT count(*)::int AS documents, COALESCE(sum(chunk_count), 0)::int AS chunks
         FROM documents WHERE workspace_id = $1`,
      [workspaceId],
    );
    return { totals, daily, recent, ...docs };
  }

  @Get('tickets')
  tickets(@Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.db.query(
      `SELECT id, title, description, status, created_at FROM tickets
        WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId],
    );
  }
}
