import { Body, Controller, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { Response } from 'express';
import { AgentService } from '../agent/agent.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { WorkspacesService } from '../workspaces/workspaces.controller';

class ChatTurnDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(8000)
  content: string;
}

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  question: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  history?: ChatTurnDto[];
}

export class SearchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  query: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;
}

@Controller('workspaces/:workspaceId')
export class ChatController {
  constructor(
    private readonly agent: AgentService,
    private readonly retrieval: RetrievalService,
    private readonly workspaces: WorkspacesService,
  ) {}

  /** Server-Sent Events stream of AgentEvent objects. */
  @Post('chat')
  async chat(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: ChatDto,
    @Res() res: Response,
  ) {
    await this.workspaces.get(workspaceId);
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let closed = false;
    res.on('close', () => (closed = true));

    try {
      for await (const event of this.agent.run(workspaceId, dto.question, dto.history ?? [])) {
        if (closed) break;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err: any) {
      if (!closed) res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    } finally {
      res.end();
    }
  }

  /** Same agent, single JSON response (used by the MCP server). */
  @Post('ask')
  async ask(@Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Body() dto: ChatDto) {
    await this.workspaces.get(workspaceId);
    return this.agent.ask(workspaceId, dto.question, dto.history ?? []);
  }

  /** Raw hybrid search results (debugging, MCP, evals). */
  @Post('search')
  async search(@Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Body() dto: SearchDto) {
    await this.workspaces.get(workspaceId);
    return this.retrieval.search(workspaceId, dto.query, dto.topK ?? 6);
  }
}
