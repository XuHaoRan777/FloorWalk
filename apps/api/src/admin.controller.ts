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
import type { Pool } from 'pg';
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
    const duplicate = await this.pool.query(
      'SELECT 1 FROM floorwalk.sites WHERE code = $1',
      [input.code],
    );
    if (duplicate.rowCount)
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: '门店编码已存在。',
      });
    return siteResponseSchema.parse({
      id: randomUUID(),
      ...input,
      active: true,
      createdAt: new Date().toISOString(),
    });
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
      `SELECT id, code, name, deactivated_at IS NULL AS active,
          created_at AS "createdAt"
       FROM floorwalk.sites WHERE id = $1`,
      [id],
    );
    const site = result.rows[0];
    if (!site)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '门店不存在。',
      });
    return siteResponseSchema.parse({
      ...site,
      ...input,
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
    const duplicate = await this.pool.query(
      'SELECT 1 FROM floorwalk.templates WHERE name = $1',
      [input.name],
    );
    if (duplicate.rowCount)
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: '模板名称已存在。',
      });
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    return templateResponseSchema.parse({
      id,
      name: input.name,
      isCurrent: false,
      createdAt,
      items: input.items.map((item, index) => ({
        id: randomUUID(),
        templateId: id,
        position: index + 1,
        ...item,
        createdAt,
      })),
    });
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
    const existing = await this.getTemplate(id);
    const duplicate = await this.pool.query(
      'SELECT 1 FROM floorwalk.templates WHERE name = $1 AND id <> $2',
      [input.name, id],
    );
    if (duplicate.rowCount)
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: '模板名称已存在。',
      });
    return templateResponseSchema.parse({
      ...existing,
      name: input.name,
      items: input.items.map((item, index) => ({
        ...existing.items[index],
        id: existing.items[index]?.id ?? randomUUID(),
        templateId: id,
        ...item,
        createdAt: existing.items[index]?.createdAt ?? new Date().toISOString(),
      })),
    });
  }

  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Post(apiRoutePath(apiRoutes.setCurrentAdminTemplate))
  async setCurrentTemplate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.setCurrentAdminTemplate.roles);
    return templateResponseSchema.parse({
      ...(await this.getTemplate(id)),
      isCurrent: true,
    });
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
