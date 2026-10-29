import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  apiRoutePath,
  apiRoutes,
  adminSitesResponseSchema,
  adminTemplatesResponseSchema,
  createSiteRequestSchema,
  createTemplateRequestSchema,
  siteResponseSchema,
  templateResponseSchema,
  updateSiteRequestSchema,
  updateTemplateRequestSchema,
} from '@libs/shared';
import type { Pool, PoolClient } from 'pg';
import { AuthGuard } from './auth.js';
import { DATABASE_POOL } from './db/pool.provider.js';
import { assertRole, iso, type AuthedRequest } from './inspection-queries.js';

@Controller('api')
export class AdminController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.listAdminSites))
  async listSites(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.listAdminSites.roles);
    const result = await this.pool.query(
      `SELECT id, code, name, deactivated_at IS NULL AS active,
          created_at AS "createdAt"
       FROM floorwalk.sites ORDER BY code`,
    );
    return adminSitesResponseSchema.parse(
      result.rows.map((row) => ({ ...row, createdAt: iso(row.createdAt) })),
    );
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.createAdminSite))
  async createSite(@Body() body: unknown, @Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.createAdminSite.roles);
    const input = createSiteRequestSchema.parse(body);
    try {
      const result = await this.pool.query(
        `INSERT INTO floorwalk.sites (code, name)
         VALUES ($1, $2)
         RETURNING id, code, name, deactivated_at IS NULL AS active,
           created_at AS "createdAt"`,
        [input.code, input.name],
      );
      return siteResponseSchema.parse({
        ...result.rows[0],
        createdAt: iso(result.rows[0].createdAt),
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException({
          code: 'INVALID_STATE',
          message: '门店编码已存在。',
        });
      throw error;
    }
  }

  @UseGuards(AuthGuard)
  @Patch(apiRoutePath(apiRoutes.updateAdminSite))
  async updateSite(
    @Body() body: unknown,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.updateAdminSite.roles);
    const input = updateSiteRequestSchema.parse(body);
    const result = await this.pool.query(
      `UPDATE floorwalk.sites
       SET name = COALESCE($2, name),
           deactivated_at = CASE
             WHEN $3::boolean IS NULL THEN deactivated_at
             WHEN $3 THEN NULL
             ELSE COALESCE(deactivated_at, now())
           END
       WHERE id = $1
       RETURNING id, code, name, deactivated_at IS NULL AS active,
         created_at AS "createdAt"`,
      [id, input.name ?? null, input.active ?? null],
    );
    const site = result.rows[0];
    if (!site)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '门店不存在。',
      });
    return siteResponseSchema.parse({
      ...site,
      createdAt: iso(site.createdAt),
    });
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.listAdminTemplates))
  async listTemplates(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.listAdminTemplates.roles);
    const templates = await this.pool.query(
      `SELECT id, name, is_current AS "isCurrent", created_at AS "createdAt"
       FROM floorwalk.templates ORDER BY created_at, id`,
    );
    const items = await this.pool.query(
      `SELECT id, template_id AS "templateId", position, title,
          photo_required AS "photoRequired", critical, created_at AS "createdAt"
       FROM floorwalk.template_items ORDER BY template_id, position`,
    );
    return adminTemplatesResponseSchema.parse(
      templates.rows.map((template) => ({
        ...template,
        createdAt: iso(template.createdAt),
        items: items.rows
          .filter((item) => item.templateId === template.id)
          .map((item) => ({ ...item, createdAt: iso(item.createdAt) })),
      })),
    );
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.createAdminTemplate))
  async createTemplate(@Body() body: unknown, @Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.createAdminTemplate.roles);
    const input = createTemplateRequestSchema.parse(body);
    const id = randomUUID();
    const client = await this.pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO floorwalk.templates (id, name) VALUES ($1, $2)',
        [id, input.name],
      );
      await this.insertTemplateItems(client, id, input.items);
      await client.query('COMMIT');
      committed = true;
    } catch (error) {
      if (!committed) await client.query('ROLLBACK');
      if (isUniqueViolation(error))
        throw new ConflictException({
          code: 'INVALID_STATE',
          message: '模板名称已存在。',
        });
      throw error;
    } finally {
      client.release();
    }
    return templateResponseSchema.parse(await this.getTemplate(id));
  }

  @UseGuards(AuthGuard)
  @Put(apiRoutePath(apiRoutes.updateAdminTemplate))
  async updateTemplate(
    @Body() body: unknown,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.updateAdminTemplate.roles);
    const input = updateTemplateRequestSchema.parse(body);
    const client = await this.pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT id FROM floorwalk.templates WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!existing.rowCount)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '模板不存在。',
        });
      await client.query(
        'UPDATE floorwalk.templates SET name = $2 WHERE id = $1',
        [id, input.name],
      );
      await client.query(
        'DELETE FROM floorwalk.template_items WHERE template_id = $1',
        [id],
      );
      await this.insertTemplateItems(client, id, input.items);
      await client.query('COMMIT');
      committed = true;
    } catch (error) {
      if (!committed) await client.query('ROLLBACK');
      if (isUniqueViolation(error))
        throw new ConflictException({
          code: 'INVALID_STATE',
          message: '模板名称已存在。',
        });
      throw error;
    } finally {
      client.release();
    }
    return templateResponseSchema.parse(await this.getTemplate(id));
  }

  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Post(apiRoutePath(apiRoutes.setCurrentAdminTemplate))
  async setCurrentTemplate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.setCurrentAdminTemplate.roles);
    const client = await this.pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const templates = await client.query(
        'SELECT id FROM floorwalk.templates ORDER BY id FOR UPDATE',
      );
      if (!templates.rows.some((template) => template.id === id))
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '模板不存在。',
        });
      await client.query('UPDATE floorwalk.templates SET is_current = false');
      await client.query(
        'UPDATE floorwalk.templates SET is_current = true WHERE id = $1',
        [id],
      );
      await client.query('COMMIT');
      committed = true;
    } catch (error) {
      if (!committed) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return templateResponseSchema.parse(await this.getTemplate(id));
  }

  private async insertTemplateItems(
    client: PoolClient,
    templateId: string,
    items: Array<{
      position?: number;
      title: string;
      photoRequired: boolean;
      critical: boolean;
    }>,
  ) {
    for (const [index, item] of items.entries())
      await client.query(
        `INSERT INTO floorwalk.template_items
           (template_id, position, title, photo_required, critical)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          templateId,
          item.position ?? index + 1,
          item.title,
          item.photoRequired,
          item.critical,
        ],
      );
  }

  private async getTemplate(id: string) {
    const result = await this.pool.query(
      `SELECT id, name, is_current AS "isCurrent", created_at AS "createdAt"
       FROM floorwalk.templates WHERE id = $1`,
      [id],
    );
    const template = result.rows[0];
    if (!template)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '模板不存在。',
      });
    const items = await this.pool.query(
      `SELECT id, template_id AS "templateId", position, title,
          photo_required AS "photoRequired", critical, created_at AS "createdAt"
       FROM floorwalk.template_items WHERE template_id = $1 ORDER BY position`,
      [id],
    );
    return {
      ...template,
      createdAt: iso(template.createdAt),
      items: items.rows.map((item) => ({
        ...item,
        createdAt: iso(item.createdAt),
      })),
    };
  }
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}
