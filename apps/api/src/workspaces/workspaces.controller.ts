import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { DbService } from '../db/db.service';

export class CreateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;
}

@Injectable()
export class WorkspacesService {
  constructor(private readonly db: DbService) {}

  list() {
    return this.db.query(
      `SELECT w.id, w.name, w.created_at,
              (SELECT count(*)::int FROM documents d WHERE d.workspace_id = w.id) AS document_count
         FROM workspaces w ORDER BY w.created_at DESC`,
    );
  }

  async get(id: string) {
    const ws = await this.db.one('SELECT id, name, created_at FROM workspaces WHERE id = $1', [id]);
    if (!ws) throw new NotFoundException('Workspace not found');
    return ws;
  }

  create(name: string) {
    return this.db.one('INSERT INTO workspaces (name) VALUES ($1) RETURNING id, name, created_at', [
      name.trim(),
    ]);
  }

  async remove(id: string) {
    await this.get(id);
    await this.db.query('DELETE FROM workspaces WHERE id = $1', [id]);
    return { deleted: true };
  }
}

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  list() {
    return this.workspaces.list();
  }

  @Post()
  create(@Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(dto.name);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.workspaces.get(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.workspaces.remove(id);
  }
}

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
