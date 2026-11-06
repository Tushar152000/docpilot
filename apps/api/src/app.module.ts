import { BullModule } from '@nestjs/bullmq';
import { Controller, Get, Module } from '@nestjs/common';
import { AgentService } from './agent/agent.service';
import { ChatController } from './chat/chat.controller';
import { config } from './config';
import { DbModule } from './db/db.module';
import { DocumentsController, DocumentsService } from './documents/documents.controller';
import { EvalsController, EvalsService } from './evals/evals.controller';
import { IngestionProcessor, INGEST_QUEUE } from './ingestion/ingestion.processor';
import { InsightsController } from './insights/insights.controller';
import { LlmModule } from './llm/llm.module';
import { LlmService } from './llm/llm.service';
import { RetrievalService } from './retrieval/retrieval.service';
import { WorkspacesModule } from './workspaces/workspaces.controller';

function redisConnection() {
  const url = new URL(config.redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}

@Controller()
class HealthController {
  constructor(private readonly llm: LlmService) {}

  @Get('health')
  health() {
    return { ok: true, mode: this.llm.mode, embeddingModel: this.llm.embeddingModel };
  }
}

@Module({
  imports: [
    DbModule,
    LlmModule,
    WorkspacesModule,
    BullModule.forRoot({ connection: redisConnection() }),
    BullModule.registerQueue({ name: INGEST_QUEUE }),
  ],
  controllers: [HealthController, DocumentsController, ChatController, EvalsController, InsightsController],
  providers: [DocumentsService, IngestionProcessor, RetrievalService, AgentService, EvalsService],
})
export class AppModule {}
