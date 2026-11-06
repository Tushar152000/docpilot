import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Pool, QueryResultRow } from 'pg';
import { config } from '../config';

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  readonly pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

  async onModuleInit() {
    await this.migrate();
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.pool.query<T>(sql, params);
    return res.rows;
  }

  async one<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  /** Applies every .sql file in the migrations dir, in name order. Files are idempotent. */
  private async migrate() {
    const dir = config.migrationsDir;
    if (!fs.existsSync(dir)) {
      this.logger.warn(`Migrations dir not found: ${dir}`);
      return;
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      await this.pool.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      this.logger.log(`Applied migration ${file}`);
    }
  }
}

/** pgvector literal: '[0.1,0.2,...]' */
export function toVector(values: number[]): string {
  return `[${values.map((v) => (Number.isFinite(v) ? v.toFixed(6) : '0')).join(',')}]`;
}
