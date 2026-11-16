import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { adminSitesResponseSchema } from '@libs/shared';
import { AppModule } from '../app.module.js';
import { HttpErrorFilter } from '../filters/http-exception.filter.js';
import { createPool } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { seedDatabase } from '../db/seed.js';

describe('site managers (FW-024)', () => {
  let app: NestExpressApplication;
  let adminCookie: string;
  let siteId: string;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    const pool = createPool();
    try {
      siteId = (
        await pool.query("SELECT id FROM floorwalk.sites WHERE code = 'NB-001'")
      ).rows[0].id;
    } finally {
      await pool.end();
    }
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
    const login = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ loginName: 'hq@northbean.example', password: 'northbean-demo' })
      .expect(201);
    adminCookie = (login.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
  }, 60000);

  afterAll(async () => {
    const pool = createPool();
    try {
      await pool.query('DELETE FROM floorwalk.sessions');
    } finally {
      await pool.end();
      await app.close();
    }
  });

  it('lists the managers of a site and removes supervisor assignment', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/sites')
      .set('Cookie', adminCookie)
      .expect(200);
    const site = adminSitesResponseSchema
      .parse(response.body)
      .find((entry) => entry.id === siteId);
    expect(site?.storeManagers).toHaveLength(2);
    await request(app.getHttpServer())
      .put(`/api/admin/sites/${siteId}/supervisor`)
      .set('Cookie', adminCookie)
      .send({ userId: null })
      .expect(404);
  });
});
