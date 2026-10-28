import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { createPool } from './client.js';

export const DATABASE_POOL = Symbol('DATABASE_POOL');

@Injectable()
export class DatabasePoolLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}

export const databasePoolProvider = {
  provide: DATABASE_POOL,
  useFactory: () =>
    createPool(undefined, { application_name: 'floorwalk-api' }),
};
