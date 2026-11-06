import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Queue } from 'bullmq';
import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { INGEST_QUEUE, IngestJob } from '../ingestion/ingestion.processor';
import { extractFromFile } from '../ingestion/parser';
import { WorkspacesService } from '../workspaces/workspaces.controller';

export class AddUrlDto {
  @IsUrl({ require_protocol: true })
  url: string;
}

export class AddTextDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsString()
  source?: string;
}

const DOC_COLUMNS =
  'id, workspace_id, title, source_type, source_uri, status, progress, error, chunk_count, created_at, updated_at';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly db: DbService,
    private readonly workspaces: WorkspacesService,
    @InjectQueue(INGEST_QUEUE) private readonly queue: Queue<IngestJob>,
  ) {}

  async list(workspaceId: string) {
    await this.workspaces.get(workspaceId);
    return this.db.query(
      `SELECT ${DOC_COLUMNS} FROM documents WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId],
    );
  }

  async create(
    workspaceId: string,
    input: { title: string; sourceType: 'file' | 'url' | 'text'; sourceUri: string | null; rawText: string | null },
  ) {
    await this.workspaces.get(workspaceId);
    const doc = await this.db.one(
      `INSERT INTO documents (workspace_id, title, source_type, source_uri, raw_text)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${DOC_COLUMNS}`,
      [workspaceId, input.title, input.sourceType, input.sourceUri, input.rawText],
    );
    await this.enqueue(doc!.id);
    return doc;
  }

  async reindex(workspaceId: string, documentId: string) {
    await this.getDoc(workspaceId, documentId);
    await this.db.query(
      `UPDATE documents SET status = 'queued', progress = 0, error = NULL WHERE id = $1`,
      [documentId],
    );
    await this.enqueue(documentId);
    return { queued: true };
  }

  async remove(workspaceId: string, documentId: string) {
    await this.getDoc(workspaceId, documentId);
    await this.db.query('DELETE FROM documents WHERE id = $1', [documentId]);
    return { deleted: true };
  }

  async chunk(workspaceId: string, chunkId: string) {
    const row = await this.db.one(
      `SELECT c.id, c.ordinal, c.content, c.document_id, d.title, d.source_uri
         FROM chunks c JOIN documents d ON d.id = c.document_id
        WHERE c.id = $1 AND c.workspace_id = $2`,
      [chunkId, workspaceId],
    );
    if (!row) throw new NotFoundException('Chunk not found');
    return row;
  }

  private async getDoc(workspaceId: string, documentId: string) {
    const doc = await this.db.one(
      'SELECT id FROM documents WHERE id = $1 AND workspace_id = $2',
      [documentId, workspaceId],
    );
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  private enqueue(documentId: string) {
    return this.queue.add(
      'ingest',
      { documentId },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 200 },
    );
  }
}

@Controller('workspaces/:workspaceId')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get('documents')
  list(@Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.docs.list(workspaceId);
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: config.maxUploadBytes } }))
  async upload(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Attach a file in the "file" field');
    const text = await extractFromFile(file.buffer, file.originalname, file.mimetype).catch(() => {
      throw new BadRequestException('Could not read this file. It may be corrupt or password-protected.');
    });
    if (!text.trim()) throw new BadRequestException('Could not extract any text from this file');
    return this.docs.create(workspaceId, {
      title: file.originalname,
      sourceType: 'file',
      sourceUri: file.originalname,
      rawText: text,
    });
  }

  @Post('documents/url')
  addUrl(@Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Body() dto: AddUrlDto) {
    return this.docs.create(workspaceId, {
      title: dto.url,
      sourceType: 'url',
      sourceUri: dto.url,
      rawText: null,
    });
  }

  @Post('documents/text')
  addText(@Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Body() dto: AddTextDto) {
    return this.docs.create(workspaceId, {
      title: dto.title,
      sourceType: 'text',
      sourceUri: dto.source ?? dto.title,
      rawText: dto.text,
    });
  }

  @Post('documents/:documentId/reindex')
  reindex(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.docs.reindex(workspaceId, documentId);
  }

  @Delete('documents/:documentId')
  remove(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.docs.remove(workspaceId, documentId);
  }

  @Get('chunks/:chunkId')
  chunk(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('chunkId', ParseUUIDPipe) chunkId: string,
  ) {
    return this.docs.chunk(workspaceId, chunkId);
  }
}
