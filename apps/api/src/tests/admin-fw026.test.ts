import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import {
  adminAiStandardsResponseSchema,
  adminTemplatesResponseSchema,
  aiStandardResponseSchema,
  quickSetupTemplateResponseSchema,
  templateResponseSchema,
} from '@libs/shared';
import { AppModule } from '../app.module.js';
import { hashSessionId } from '../auth/auth.js';
import { createPool } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { HttpErrorFilter } from '../filters/http-exception.filter.js';

type Fixture = {
  orgId: string;
  adminCookie: string;
  managerCookie: string;
  standardId: string;
  templateId: string;
};
const item = {
  title: '检查台面',
  critical: true,
  minPhotoCount: 2,
  acceptanceCriteria: '台面清洁，物品分类摆放。',
};

describe('FW-026 template and AI standard administration', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let own: Fixture;
  let other: Fixture;
  let quota: Fixture;
  const orgIds: string[] = [];

  async function fixture(): Promise<Fixture> {
    const client = await pool.connect();
    const orgId = randomUUID();
    const adminId = randomUUID();
    const siteId = randomUUID();
    const managerId = randomUUID();
    const standardId = randomUUID();
    const templateId = randomUUID();
    const adminToken = randomUUID();
    const managerToken = randomUUID();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO floorwalk.organizations (id, name) VALUES ($1, $2)',
        [orgId, `FW026-${orgId}`],
      );
      await client.query(
        `INSERT INTO floorwalk.sites (id, org_id, code, name)
         VALUES ($1, $2, 'TEST', 'FW-026 test site')`,
        [siteId, orgId],
      );
      await client.query(
        `INSERT INTO floorwalk.users (id, org_id, login_name, password_hash, display_name, role, site_id)
         VALUES ($1, $2, 'admin@example.test', 'hash', 'Test admin', 'admin', NULL),
                ($3, $2, 'manager@example.test', 'hash', 'Test manager', 'store_manager', $4)`,
        [adminId, orgId, managerId, siteId],
      );
      await client.query(
        `INSERT INTO floorwalk.sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, now() + interval '7 days'), ($3, $4, now() + interval '7 days')`,
        [
          hashSessionId(adminToken),
          adminId,
          hashSessionId(managerToken),
          managerId,
        ],
      );
      await client.query(
        `INSERT INTO floorwalk.ai_review_standards (id, org_id, name, prompt)
         VALUES ($1, $2, 'Anchor standard', '逐条检查照片及验收要点。')`,
        [standardId, orgId],
      );
      await client.query(
        `INSERT INTO floorwalk.templates (id, org_id, name, ai_enabled, ai_standard_id)
         VALUES ($1, $2, 'Anchor template', true, $3)`,
        [templateId, orgId, standardId],
      );
      await client.query(
        `INSERT INTO floorwalk.template_items (template_id, position, title, min_photo_count, acceptance_criteria, critical)
         VALUES ($1, 1, 'Anchor item', 1, '检查清洁情况', true)`,
        [templateId],
      );
      await client.query('COMMIT');
      orgIds.push(orgId);
      return {
        orgId,
        adminCookie: `fw_session=${adminToken}`,
        managerCookie: `fw_session=${managerToken}`,
        standardId,
        templateId,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    await runMigrations();
    pool = createPool();
    own = await fixture();
    other = await fixture();
    quota = await fixture();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
  }, 60000);

  afterAll(async () => {
    if (pool && orgIds.length) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'DELETE FROM floorwalk.template_items WHERE template_id IN (SELECT id FROM floorwalk.templates WHERE org_id = ANY($1::uuid[]))',
          [orgIds],
        );
        for (const table of [
          'templates',
          'ai_review_standards',
          'users',
          'sites',
        ])
          await client.query(
            `DELETE FROM floorwalk.${table} WHERE org_id = ANY($1::uuid[])`,
            [orgIds],
          );
        await client.query(
          'DELETE FROM floorwalk.organizations WHERE id = ANY($1::uuid[])',
          [orgIds],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    if (app) await app.close();
    if (pool) await pool.end();
  });

  it('creates, updates and deletes standards, enforces tenant uniqueness and prompt length', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/admin/ai-standards')
      .set('Cookie', own.adminCookie)
      .send({ name: '  新标准  ', prompt: '一'.repeat(4000) })
      .expect(201);
    const standard = aiStandardResponseSchema.parse(created.body);
    expect(standard.name).toBe('新标准');
    expect(standard.prompt).toHaveLength(4000);
    await request(app.getHttpServer())
      .post('/api/admin/ai-standards')
      .set('Cookie', own.adminCookie)
      .send({ name: '新标准', prompt: '重复' })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/admin/ai-standards')
      .set('Cookie', other.adminCookie)
      .send({ name: '新标准', prompt: '另一商家同名' })
      .expect(201);
    for (const input of [
      { name: '', prompt: '有效' },
      { name: '空提示词', prompt: '' },
      { name: '超长提示词', prompt: '一'.repeat(4001) },
    ]) {
      await request(app.getHttpServer())
        .post('/api/admin/ai-standards')
        .set('Cookie', own.adminCookie)
        .send(input)
        .expect(400);
      await request(app.getHttpServer())
        .put(`/api/admin/ai-standards/${standard.id}`)
        .set('Cookie', own.adminCookie)
        .send(input)
        .expect(400);
    }
    await request(app.getHttpServer())
      .put(`/api/admin/ai-standards/${standard.id}`)
      .set('Cookie', own.adminCookie)
      .send({ name: 'Anchor standard', prompt: '同商家冲突' })
      .expect(409);
    const updated = await request(app.getHttpServer())
      .put(`/api/admin/ai-standards/${standard.id}`)
      .set('Cookie', own.adminCookie)
      .send({ name: '已修改标准', prompt: '新提示词' })
      .expect(200);
    expect(aiStandardResponseSchema.parse(updated.body)).toMatchObject({
      id: standard.id,
      name: '已修改标准',
      prompt: '新提示词',
    });
    await request(app.getHttpServer())
      .delete(`/api/admin/ai-standards/${standard.id}`)
      .set('Cookie', own.adminCookie)
      .expect(204);
    const listed = await request(app.getHttpServer())
      .get('/api/admin/ai-standards')
      .set('Cookie', own.adminCookie)
      .expect(200);
    expect(
      adminAiStandardsResponseSchema
        .parse(listed.body)
        .some((value) => value.id === standard.id),
    ).toBe(false);
  });

  it('persists the new template fields and accepts their exact range boundaries', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', own.adminCookie)
      .send({ name: '新字段模板', aiStandardId: own.standardId, items: [item] })
      .expect(201);
    const template = templateResponseSchema.parse(created.body);
    expect(template).toMatchObject({
      aiEnabled: true,
      aiStandardId: own.standardId,
    });
    expect(template.items[0]).toMatchObject(item);
    expect(created.body).not.toHaveProperty('isCurrent');
    expect(created.body.items[0]).not.toHaveProperty('photoRequired');
    const updated = await request(app.getHttpServer())
      .put(`/api/admin/templates/${template.id}`)
      .set('Cookie', own.adminCookie)
      .send({
        name: '已修改模板',
        aiEnabled: false,
        aiStandardId: null,
        items: [
          { ...item, position: 1, minPhotoCount: 0, acceptanceCriteria: '' },
          {
            ...item,
            position: 2,
            minPhotoCount: 10,
            acceptanceCriteria: '一'.repeat(500),
          },
        ],
      })
      .expect(200);
    expect(templateResponseSchema.parse(updated.body)).toMatchObject({
      name: '已修改模板',
      aiEnabled: false,
      aiStandardId: null,
    });
    const listed = await request(app.getHttpServer())
      .get('/api/admin/templates')
      .set('Cookie', own.adminCookie)
      .expect(200);
    const saved = adminTemplatesResponseSchema
      .parse(listed.body)
      .find((value) => value.id === template.id)!;
    expect(saved.items.map((value) => value.minPhotoCount)).toEqual([0, 10]);
    expect(saved.items[1].acceptanceCriteria).toHaveLength(500);
    for (const invalid of [
      { ...item, minPhotoCount: -1 },
      { ...item, minPhotoCount: 11 },
      { ...item, minPhotoCount: 1.5 },
      { ...item, acceptanceCriteria: '一'.repeat(501) },
    ]) {
      await request(app.getHttpServer())
        .post('/api/admin/templates')
        .set('Cookie', own.adminCookie)
        .send({ name: '无效模板', aiEnabled: false, items: [invalid] })
        .expect(400);
      await request(app.getHttpServer())
        .put(`/api/admin/templates/${template.id}`)
        .set('Cookie', own.adminCookie)
        .send({
          name: '无效更新',
          aiEnabled: false,
          items: [{ ...invalid, position: 1 }],
        })
        .expect(400);
    }
  });

  it('requires a tenant-owned AI standard when enabled and permits an empty selection when disabled', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', own.adminCookie)
      .send({ name: '默认开但未选', items: [item] })
      .expect(400);
    const created = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', own.adminCookie)
      .send({ name: '关闭可空', aiEnabled: false, items: [item] })
      .expect(201);
    expect(templateResponseSchema.parse(created.body)).toMatchObject({
      aiEnabled: false,
      aiStandardId: null,
    });
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${created.body.id}`)
      .set('Cookie', own.adminCookie)
      .send({
        name: '开启未选',
        aiEnabled: true,
        aiStandardId: null,
        items: [{ ...item, position: 1 }],
      })
      .expect(400);
    for (const aiEnabled of [true, false]) {
      for (const aiStandardId of [other.standardId, randomUUID()]) {
        await request(app.getHttpServer())
          .post('/api/admin/templates')
          .set('Cookie', own.adminCookie)
          .send({ name: '越权选标准', aiEnabled, aiStandardId, items: [item] })
          .expect(400);
        await request(app.getHttpServer())
          .put(`/api/admin/templates/${created.body.id}`)
          .set('Cookie', own.adminCookie)
          .send({
            name: '越权改标准',
            aiEnabled,
            aiStandardId,
            items: [{ ...item, position: 1 }],
          })
          .expect(400);
      }
    }
  });

  it('blocks deletion of a referenced standard even when AI is disabled on its template', async () => {
    await request(app.getHttpServer())
      .delete(`/api/admin/ai-standards/${own.standardId}`)
      .set('Cookie', own.adminCookie)
      .expect(409);
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${own.templateId}`)
      .set('Cookie', own.adminCookie)
      .send({
        name: 'Anchor template',
        aiEnabled: false,
        aiStandardId: own.standardId,
        items: [{ ...item, position: 1 }],
      })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/admin/ai-standards/${own.standardId}`)
      .set('Cookie', own.adminCookie)
      .expect(409);
  });

  it('serializes concurrent template creation at the twentieth slot and rejects the twenty-first', async () => {
    await pool.query(
      `INSERT INTO floorwalk.templates (org_id, name, ai_enabled)
       SELECT $1, 'Quota ' || number, false FROM generate_series(1, 18) number`,
      [quota.orgId],
    );
    const results = await Promise.all(
      ['A', 'B'].map((name) =>
        request(app.getHttpServer())
          .post('/api/admin/templates')
          .set('Cookie', quota.adminCookie)
          .send({ name: `Last slot ${name}`, aiEnabled: false, items: [item] }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', quota.adminCookie)
      .send({ name: 'Twenty-first', aiEnabled: false, items: [item] })
      .expect(409);
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM floorwalk.templates WHERE org_id = $1',
          [quota.orgId],
        )
      ).rows[0].count,
    ).toBe('20');
  });

  it('denies store managers access to every template and standard management endpoint', async () => {
    const server = app.getHttpServer();
    for (const call of [
      () => request(server).get('/api/admin/templates'),
      () =>
        request(server)
          .post('/api/admin/templates')
          .send({ name: 'Denied', aiEnabled: false, items: [item] }),
      () =>
        request(server)
          .put(`/api/admin/templates/${own.templateId}`)
          .send({
            name: 'Denied',
            aiEnabled: false,
            items: [{ ...item, position: 1 }],
          }),
      () => request(server).get('/api/admin/ai-standards'),
      () =>
        request(server)
          .post('/api/admin/ai-standards')
          .send({ name: 'Denied', prompt: 'Denied' }),
      () =>
        request(server)
          .put(`/api/admin/ai-standards/${own.standardId}`)
          .send({ name: 'Denied', prompt: 'Denied' }),
      () => request(server).delete(`/api/admin/ai-standards/${own.standardId}`),
    ]) {
      await call().set('Cookie', own.managerCookie).expect(403);
    }
  });

  it('hides foreign resources in lists and returns 404 for cross-tenant resource paths', async () => {
    const templates = await request(app.getHttpServer())
      .get('/api/admin/templates')
      .set('Cookie', own.adminCookie)
      .expect(200);
    expect(
      adminTemplatesResponseSchema
        .parse(templates.body)
        .some((value) => value.id === other.templateId),
    ).toBe(false);
    const standards = await request(app.getHttpServer())
      .get('/api/admin/ai-standards')
      .set('Cookie', own.adminCookie)
      .expect(200);
    expect(
      adminAiStandardsResponseSchema
        .parse(standards.body)
        .some((value) => value.id === other.standardId),
    ).toBe(false);
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${other.templateId}`)
      .set('Cookie', own.adminCookie)
      .send({
        name: 'Cross tenant',
        aiEnabled: false,
        items: [{ ...item, position: 1 }],
      })
      .expect(404);
    await request(app.getHttpServer())
      .put(`/api/admin/ai-standards/${other.standardId}`)
      .set('Cookie', own.adminCookie)
      .send({ name: 'Cross tenant', prompt: 'Cross tenant' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/admin/ai-standards/${other.standardId}`)
      .set('Cookie', own.adminCookie)
      .expect(404);
    const persisted = await pool.query(
      'SELECT name FROM floorwalk.ai_review_standards WHERE id = $1',
      [other.standardId],
    );
    expect(persisted.rows[0].name).toBe('Anchor standard');
  });

  it('快捷配置 creates all three presets, selects their standards and numbers repeated names within each tenant', async () => {
    const target = await fixture();
    const separate = await fixture();
    const server = app.getHttpServer();
    const created = [];
    for (const kind of ['coffee', 'restaurant', 'florist']) {
      const result = await request(server)
        .post('/api/admin/templates/quick-setup')
        .set('Cookie', target.adminCookie)
        .send({ kind })
        .expect(201);
      const value = quickSetupTemplateResponseSchema.parse(result.body);
      expect(value.template.aiEnabled).toBe(true);
      expect(value.template.aiStandardId).toBe(value.standard.id);
      expect(value.template.items.length).toBeGreaterThan(0);
      expect(value.template.items.some((entry) => entry.critical)).toBe(true);
      expect(
        value.template.items.every(
          (entry) => entry.acceptanceCriteria.trim().length > 0,
        ),
      ).toBe(true);
      created.push(value);
    }
    const repeats = await Promise.all(
      [1, 2].map(() =>
        request(server)
          .post('/api/admin/templates/quick-setup')
          .set('Cookie', target.adminCookie)
          .send({ kind: 'coffee' })
          .expect(201),
      ),
    );
    const numbered = repeats.map((result) =>
      quickSetupTemplateResponseSchema.parse(result.body),
    );
    expect(numbered.map((value) => value.template.name).sort()).toEqual([
      `${created[0].template.name}（2）`,
      `${created[0].template.name}（3）`,
    ]);
    expect(numbered.map((value) => value.standard.name).sort()).toEqual([
      `${created[0].standard.name}（2）`,
      `${created[0].standard.name}（3）`,
    ]);
    const independent = await request(server)
      .post('/api/admin/templates/quick-setup')
      .set('Cookie', separate.adminCookie)
      .send({ kind: 'coffee' })
      .expect(201);
    expect(independent.body.template.name).toBe(created[0].template.name);
    expect(independent.body.standard.name).toBe(created[0].standard.name);
    const templates = adminTemplatesResponseSchema.parse(
      (
        await request(server)
          .get('/api/admin/templates')
          .set('Cookie', target.adminCookie)
          .expect(200)
      ).body,
    );
    const standards = adminAiStandardsResponseSchema.parse(
      (
        await request(server)
          .get('/api/admin/ai-standards')
          .set('Cookie', target.adminCookie)
          .expect(200)
      ).body,
    );
    for (const value of [...created, ...numbered]) {
      expect(templates.find((entry) => entry.id === value.template.id)).toEqual(
        value.template,
      );
      expect(standards.find((entry) => entry.id === value.standard.id)).toEqual(
        value.standard,
      );
    }
  });

  it('快捷配置 shares the twentieth-template lock with ordinary creates and leaves no orphan standard on capacity failure', async () => {
    const target = await fixture();
    await pool.query(
      `INSERT INTO floorwalk.templates (org_id, name, ai_enabled)
       SELECT $1, 'Quick quota ' || number, false FROM generate_series(1, 18) number`,
      [target.orgId],
    );
    const server = app.getHttpServer();
    const results = await Promise.all([
      request(server)
        .post('/api/admin/templates/quick-setup')
        .set('Cookie', target.adminCookie)
        .send({ kind: 'coffee' }),
      request(server)
        .post('/api/admin/templates')
        .set('Cookie', target.adminCookie)
        .send({ name: 'Last ordinary slot', aiEnabled: false, items: [item] }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    await request(server)
      .post('/api/admin/templates/quick-setup')
      .set('Cookie', target.adminCookie)
      .send({ kind: 'restaurant' })
      .expect(409);
    const counts = await pool.query(
      `SELECT (SELECT count(*) FROM floorwalk.templates WHERE org_id = $1) AS templates,
         (SELECT count(*) FROM floorwalk.ai_review_standards WHERE org_id = $1) AS standards`,
      [target.orgId],
    );
    expect(counts.rows[0]).toEqual({
      templates: '20',
      standards: results[0].status === 201 ? '2' : '1',
    });
  });

  it('快捷配置 denies store managers', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/templates/quick-setup')
      .set('Cookie', own.managerCookie)
      .send({ kind: 'coffee' })
      .expect(403);
  });

  it('removes the set-current-template endpoint', async () => {
    await request(app.getHttpServer())
      .post(`/api/admin/templates/${own.templateId}/current`)
      .set('Cookie', own.adminCookie)
      .expect(404);
  });
});
