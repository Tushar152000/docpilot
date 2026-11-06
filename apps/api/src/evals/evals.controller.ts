import { Body, Controller, Get, Injectable, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { DbService } from '../db/db.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { WorkspacesService } from '../workspaces/workspaces.controller';

class EvalCaseDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  /** Substring expected in the title/source of a relevant document (case-insensitive). */
  @IsOptional()
  @IsString()
  expectedSource?: string;

  /** Phrase expected to appear in a relevant passage (case-insensitive). */
  @IsOptional()
  @IsString()
  expectedText?: string;
}

export class RunEvalDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => EvalCaseDto)
  cases: EvalCaseDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  k?: number;
}

/**
 * Retrieval evaluation: hit rate@k and MRR (mean reciprocal rank).
 * A case "hits" when any of the top-k passages comes from the expected source
 * and/or contains the expected text.
 */
@Injectable()
export class EvalsService {
  constructor(
    private readonly db: DbService,
    private readonly retrieval: RetrievalService,
    private readonly workspaces: WorkspacesService,
  ) {}

  async run(workspaceId: string, dto: RunEvalDto) {
    await this.workspaces.get(workspaceId);
    const k = dto.k ?? 5;
    const details: any[] = [];
    let hits = 0;
    let rrSum = 0;
    let latencySum = 0;

    for (const c of dto.cases) {
      const t0 = Date.now();
      const results = await this.retrieval.search(workspaceId, c.question, k);
      const latency = Date.now() - t0;
      latencySum += latency;

      const rank =
        results.findIndex((r) => {
          const srcOk =
            !c.expectedSource ||
            `${r.title} ${r.source ?? ''}`.toLowerCase().includes(c.expectedSource.toLowerCase());
          const textOk = !c.expectedText || r.content.toLowerCase().includes(c.expectedText.toLowerCase());
          return srcOk && textOk;
        }) + 1;

      if (rank > 0) {
        hits++;
        rrSum += 1 / rank;
      }
      details.push({
        question: c.question,
        expectedSource: c.expectedSource ?? null,
        expectedText: c.expectedText ?? null,
        hit: rank > 0,
        rank: rank || null,
        latencyMs: latency,
        top: results.slice(0, 3).map((r) => ({ title: r.title, score: Number(r.score.toFixed(4)) })),
      });
    }

    const total = dto.cases.length;
    const summary = {
      total,
      k,
      hitRate: hits / total,
      mrr: rrSum / total,
      avgLatencyMs: Math.round(latencySum / total),
    };
    const run = await this.db.one(
      `INSERT INTO eval_runs (workspace_id, total, hit_rate, mrr, avg_latency_ms, details)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
      [workspaceId, total, summary.hitRate, summary.mrr, summary.avgLatencyMs, JSON.stringify(details)],
    );
    return { id: run?.id, createdAt: run?.created_at, ...summary, details };
  }

  list(workspaceId: string) {
    return this.db.query(
      `SELECT id, total, hit_rate::float, mrr::float, avg_latency_ms, created_at
         FROM eval_runs WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [workspaceId],
    );
  }
}

@Controller('workspaces/:workspaceId/evals')
export class EvalsController {
  constructor(private readonly evals: EvalsService) {}

  @Post()
  run(@Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Body() dto: RunEvalDto) {
    return this.evals.run(workspaceId, dto);
  }

  @Get()
  list(@Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.evals.list(workspaceId);
  }
}
