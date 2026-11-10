import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  apiRoutePath,
  apiRoutes,
  adminAiStandardsResponseSchema,
  aiStandardResponseSchema,
  createAiStandardRequestSchema,
  updateAiStandardRequestSchema,
} from '@libs/shared';
import type { Pool } from 'pg';
import { AuthGuard } from './auth.js';
import { DATABASE_POOL } from './db/pool.provider.js';
import { assertRole, iso, type AuthedRequest } from './inspection-queries.js';

@Controller('api')
export class AiStandardsController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.listAdminAiStandards))
  async listAiStandards(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.listAdminAiStandards.roles);
    const result = await this.pool.query(
      `SELECT id, name, prompt, created_at AS "createdAt"
       FROM floorwalk.ai_review_standards WHERE org_id = $1 ORDER BY created_at, id`,
      [request.user.orgId],
    );
    return adminAiStandardsResponseSchema.parse(
      result.rows.map((row) => ({ ...row, createdAt: iso(row.createdAt) })),
    );
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.createAdminAiStandard))
  async createAiStandard(@Body() body: unknown, @Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.createAdminAiStandard.roles);
    const input = createAiStandardRequestSchema.parse(body);
    try {
      const result = await this.pool.query(
        `INSERT INTO floorwalk.ai_review_standards (org_id, name, prompt)
         VALUES ($1, $2, $3) RETURNING id, name, prompt, created_at AS "createdAt"`,
        [request.user.orgId, input.name, input.prompt],
      );
      return aiStandardResponseSchema.parse({
        ...result.rows[0],
        createdAt: iso(result.rows[0].createdAt),
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw standardNameConflict();
      throw error;
    }
  }

  @UseGuards(AuthGuard)
  @Put(apiRoutePath(apiRoutes.updateAdminAiStandard))
  async updateAiStandard(
    @Body() body: unknown,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.updateAdminAiStandard.roles);
    const input = updateAiStandardRequestSchema.parse(body);
    try {
      const result = await this.pool.query(
        `UPDATE floorwalk.ai_review_standards SET name = $2, prompt = $3
         WHERE id = $1 AND org_id = $4
         RETURNING id, name, prompt, created_at AS "createdAt"`,
        [id, input.name, input.prompt, request.user.orgId],
      );
      if (!result.rowCount) throw standardNotFound();
      return aiStandardResponseSchema.parse({
        ...result.rows[0],
        createdAt: iso(result.rows[0].createdAt),
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw standardNameConflict();
      throw error;
    }
  }

  @UseGuards(AuthGuard)
  @Delete(apiRoutePath(apiRoutes.deleteAdminAiStandard))
  @HttpCode(204)
  async deleteAiStandard(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.deleteAdminAiStandard.roles);
    try {
      const result = await this.pool.query(
        'DELETE FROM floorwalk.ai_review_standards WHERE id = $1 AND org_id = $2 RETURNING id',
        [id, request.user.orgId],
      );
      if (!result.rowCount) throw standardNotFound();
    } catch (error) {
      if (hasPostgresCode(error, '23001') || hasPostgresCode(error, '23503'))
        throw new ConflictException({
          code: 'INVALID_STATE',
          message: '该审核标准仍被模板引用，不能删除。',
        });
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown) {
  return hasPostgresCode(error, '23505');
}

function hasPostgresCode(error: unknown, code: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

function standardNameConflict() {
  return new ConflictException({
    code: 'INVALID_STATE',
    message: '审核标准名称已存在。',
  });
}

function standardNotFound() {
  return new NotFoundException({
    code: 'NOT_FOUND',
    message: '审核标准不存在。',
  });
}
