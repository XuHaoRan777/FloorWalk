import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  apiRoutePath,
  apiRoutes,
  aiStandardResponseSchema,
  adminTemplatesResponseSchema,
  createTemplateRequestSchema,
  quickSetupTemplateRequestSchema,
  quickSetupTemplateResponseSchema,
  templateResponseSchema,
  updateTemplateRequestSchema,
} from '@libs/shared';
import type { Pool, PoolClient } from 'pg';
import { AuthGuard } from '../auth/auth.js';
import { DATABASE_POOL } from '../db/pool.provider.js';
import {
  assertRole,
  iso,
  type AuthedRequest,
} from '../queries/inspection-queries.js';
import { templatePresets } from '../services/template-presets.js';

@Controller('api')
export class TemplatesController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.listAdminTemplates))
  async listTemplates(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.listAdminTemplates.roles);
    const templates = await this.pool.query(
      `SELECT id, name, ai_enabled AS "aiEnabled", ai_standard_id AS "aiStandardId", created_at AS "createdAt"
       FROM floorwalk.templates WHERE org_id = $1 ORDER BY created_at, id`,
      [request.user.orgId],
    );
    const items = await this.pool.query(
      `SELECT ti.id, ti.template_id AS "templateId", ti.position, ti.title,
          ti.min_photo_count AS "minPhotoCount", ti.acceptance_criteria AS "acceptanceCriteria",
          ti.critical, ti.created_at AS "createdAt"
       FROM floorwalk.template_items ti
       JOIN floorwalk.templates t ON t.id = ti.template_id
       WHERE t.org_id = $1 ORDER BY ti.template_id, ti.position`,
      [request.user.orgId],
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
      await this.assertTemplateCapacity(client, request.user.orgId);
      await this.assertStandardOwnership(
        client,
        input.aiStandardId,
        request.user.orgId,
      );
      await client.query(
        `INSERT INTO floorwalk.templates (id, name, org_id, ai_enabled, ai_standard_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          input.name,
          request.user.orgId,
          input.aiEnabled,
          input.aiStandardId,
        ],
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
    return templateResponseSchema.parse(
      await this.getTemplate(id, request.user.orgId),
    );
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.quickSetupAdminTemplate))
  async quickSetupTemplate(
    @Body() body: unknown,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.quickSetupAdminTemplate.roles);
    const input = quickSetupTemplateRequestSchema.parse(body);
    const preset = templatePresets[input.kind];
    const templateId = randomUUID();
    const client = await this.pool.connect();
    let standard;
    try {
      await client.query('BEGIN');
      await this.assertTemplateCapacity(client, request.user.orgId);
      // ON CONFLICT also handles names claimed by ordinary creates or edits.
      for (let number = 1; ; number += 1) {
        const result = await client.query(
          `INSERT INTO floorwalk.ai_review_standards (org_id, name, prompt)
           VALUES ($1, $2, $3) ON CONFLICT (org_id, name) DO NOTHING
           RETURNING id, name, prompt, created_at AS "createdAt"`,
          [
            request.user.orgId,
            numberedName(preset.standardName, number),
            preset.prompt,
          ],
        );
        if (result.rowCount) {
          standard = aiStandardResponseSchema.parse({
            ...result.rows[0],
            createdAt: iso(result.rows[0].createdAt),
          });
          break;
        }
      }
      for (let number = 1; ; number += 1) {
        const result = await client.query(
          `INSERT INTO floorwalk.templates (id, org_id, name, ai_enabled, ai_standard_id)
           VALUES ($1, $2, $3, true, $4) ON CONFLICT (org_id, name) DO NOTHING
           RETURNING id`,
          [
            templateId,
            request.user.orgId,
            numberedName(preset.templateName, number),
            standard.id,
          ],
        );
        if (result.rowCount) break;
      }
      await this.insertTemplateItems(client, templateId, preset.items);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return quickSetupTemplateResponseSchema.parse({
      template: await this.getTemplate(templateId, request.user.orgId),
      standard,
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
    const client = await this.pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT id FROM floorwalk.templates WHERE id = $1 AND org_id = $2 FOR UPDATE',
        [id, request.user.orgId],
      );
      if (!existing.rowCount)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '模板不存在。',
        });
      await this.assertStandardOwnership(
        client,
        input.aiStandardId,
        request.user.orgId,
      );
      await client.query(
        `UPDATE floorwalk.templates
         SET name = $2, ai_enabled = $4, ai_standard_id = $5
         WHERE id = $1 AND org_id = $3`,
        [
          id,
          input.name,
          request.user.orgId,
          input.aiEnabled,
          input.aiStandardId,
        ],
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
    return templateResponseSchema.parse(
      await this.getTemplate(id, request.user.orgId),
    );
  }

  private async assertTemplateCapacity(client: PoolClient, orgId: string) {
    // Serialize every template creation in the organization, including quick setup.
    await client.query(
      'SELECT id FROM floorwalk.organizations WHERE id = $1 FOR UPDATE',
      [orgId],
    );
    const result = await client.query<{ count: string }>(
      'SELECT count(*) FROM floorwalk.templates WHERE org_id = $1',
      [orgId],
    );
    if (Number(result.rows[0].count) >= 20)
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: '每个商家最多创建 20 个模板。',
      });
  }

  private async assertStandardOwnership(
    client: PoolClient,
    standardId: string | null,
    orgId: string,
  ) {
    if (standardId === null) return;
    const standard = await client.query(
      'SELECT id FROM floorwalk.ai_review_standards WHERE id = $1 AND org_id = $2 FOR KEY SHARE',
      [standardId, orgId],
    );
    if (!standard.rowCount)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '请选择本商家的 AI 审核标准。',
      });
  }

  private async insertTemplateItems(
    client: PoolClient,
    templateId: string,
    items: Array<{
      position?: number;
      title: string;
      minPhotoCount: number;
      acceptanceCriteria: string;
      critical: boolean;
    }>,
  ) {
    for (const [index, item] of items.entries())
      await client.query(
        `INSERT INTO floorwalk.template_items
           (template_id, position, title, min_photo_count, acceptance_criteria, critical)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          templateId,
          item.position ?? index + 1,
          item.title,
          item.minPhotoCount,
          item.acceptanceCriteria,
          item.critical,
        ],
      );
  }

  private async getTemplate(id: string, orgId: string) {
    const result = await this.pool.query(
      `SELECT id, name, ai_enabled AS "aiEnabled", ai_standard_id AS "aiStandardId", created_at AS "createdAt"
       FROM floorwalk.templates WHERE id = $1 AND org_id = $2`,
      [id, orgId],
    );
    const template = result.rows[0];
    if (!template)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '模板不存在。',
      });
    const items = await this.pool.query(
      `SELECT id, template_id AS "templateId", position, title,
          min_photo_count AS "minPhotoCount", acceptance_criteria AS "acceptanceCriteria",
          critical, created_at AS "createdAt"
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

function isUniqueViolation(error: unknown) {
  return hasPostgresCode(error, '23505');
}

function numberedName(name: string, number: number) {
  return number === 1 ? name : `${name}（${number}）`;
}

function hasPostgresCode(error: unknown, code: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
