import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { basename } from 'node:path';
import type { Request } from 'express';
import {
  apiRoutePath,
  apiRoutes,
  createInspectionRequestSchema,
  dashboardSitesResponseSchema,
  evidenceUploadFieldName,
  evidenceUploadRequestSchema,
  evidenceSchema,
  inspectionDetailSchema,
  inspectionSchema,
  loginRequestSchema,
  loginResponseSchema,
  maxEvidenceSizeBytes,
  reviewQueueResponseSchema,
  reviewRequestSchema,
  reviewResponseSchema,
  signedEvidenceResponseSchema,
  submitInspectionResponseSchema,
  todayResponseSchema,
  updateInspectionItemRequestSchema,
  updateInspectionItemResponseSchema,
  userSchema,
} from '@libs/shared';
import { createPool } from './db/client.js';
import { AuthGuard, getJwtSecret, type AuthUser } from './auth.js';

type AuthedRequest = Request & { user: AuthUser };
type UploadedImage = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : value;

function getShanghaiDayBounds(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  const start = new Date(
    Date.UTC(values.year, values.month - 1, values.day) - 8 * 60 * 60 * 1000,
  );
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

@Controller('api')
export class InspectionController {
  private readonly jwt = new JwtService({
    secret: getJwtSecret(),
  });

  @Post(apiRoutePath(apiRoutes.login))
  async login(@Body() body: unknown) {
    const input = loginRequestSchema.parse(body);
    const pool = createPool();
    try {
      const result = await pool.query<{
        id: string;
        email: string;
        password_hash: string;
        display_name: string;
        role: AuthUser['role'];
        site_id: string | null;
        created_at: string;
      }>(
        'SELECT id, email, password_hash, display_name, role, site_id, created_at FROM floorwalk.users WHERE email = $1',
        [input.email],
      );
      const row = result.rows[0];
      if (!row || !(await argon2.verify(row.password_hash, input.password)))
        throw new UnauthorizedException({
          code: 'UNAUTHENTICATED',
          message: '邮箱或密码错误。',
        });
      const user = userSchema.parse({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        siteId: row.site_id,
        createdAt: new Date(row.created_at).toISOString(),
      });
      return loginResponseSchema.parse({
        token: this.jwt.sign(
          {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            role: user.role,
            siteId: user.siteId,
          },
          { expiresIn: '1h' },
        ),
        user,
      });
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.me))
  async me(@Req() request: AuthedRequest) {
    const pool = createPool();
    try {
      const result = await pool.query<{
        id: string;
        email: string;
        display_name: string;
        role: AuthUser['role'];
        site_id: string | null;
        created_at: string;
      }>(
        'SELECT id, email, display_name, role, site_id, created_at FROM floorwalk.users WHERE id = $1',
        [request.user.id],
      );
      const row = result.rows[0];
      if (!row)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '用户不存在。',
        });
      return userSchema.parse({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        siteId: row.site_id,
        createdAt: new Date(row.created_at).toISOString(),
      });
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.today))
  async today(@Req() request: AuthedRequest) {
    this.assertRole(request.user, ...apiRoutes.today.roles);
    if (!request.user.siteId)
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '店员未绑定门店。',
      });
    const pool = createPool();
    try {
      const template = await pool.query(
        'SELECT id, name, created_at AS "createdAt" FROM floorwalk.templates ORDER BY created_at LIMIT 1',
      );
      if (!template.rows[0])
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '检查模板不存在。',
        });
      const items = await pool.query(
        'SELECT id, template_id AS "templateId", position, title, photo_required AS "photoRequired", critical, created_at AS "createdAt" FROM floorwalk.template_items WHERE template_id = $1 ORDER BY position',
        [template.rows[0].id],
      );
      const site = await pool.query(
        'SELECT id, code, name, created_at AS "createdAt" FROM floorwalk.sites WHERE id = $1',
        [request.user.siteId],
      );
      if (!site.rows[0])
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '门店不存在。',
        });
      const rework = await pool.query(
        'SELECT id, site_id AS "siteId", template_id AS "templateId", inspector_id AS "inspectorId", status, score, submitted_at AS "submittedAt", decided_at AS "decidedAt", created_at AS "createdAt" FROM floorwalk.inspections WHERE site_id = $1 AND status = \'rework\' ORDER BY created_at',
        [request.user.siteId],
      );
      const dayBounds = getShanghaiDayBounds();
      const submittedToday = await pool.query<{ submittedToday: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM floorwalk.inspections
           WHERE site_id = $1 AND submitted_at >= $2 AND submitted_at < $3
         ) AS "submittedToday"`,
        [request.user.siteId, dayBounds.start, dayBounds.end],
      );
      return todayResponseSchema.parse({
        site: {
          ...site.rows[0],
          createdAt: iso(site.rows[0].createdAt),
        },
        template: {
          ...template.rows[0],
          createdAt: iso(template.rows[0].createdAt),
          items: items.rows.map((item) => ({
            ...item,
            createdAt: iso(item.createdAt),
          })),
        },
        submittedToday: submittedToday.rows[0]?.submittedToday ?? false,
        reworkInspections: rework.rows.map((item) => ({
          ...item,
          submittedAt: iso(item.submittedAt),
          decidedAt: iso(item.decidedAt),
          createdAt: iso(item.createdAt),
        })),
      });
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.createInspection))
  async createInspection(@Body() body: unknown, @Req() request: AuthedRequest) {
    this.assertRole(request.user, ...apiRoutes.createInspection.roles);
    if (!request.user.siteId)
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '店员未绑定门店。',
      });
    const input = createInspectionRequestSchema.parse(body);
    const pool = createPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inspection = await client.query(
        `INSERT INTO floorwalk.inspections (site_id, template_id, inspector_id, status)
         VALUES ($1, $2, $3, 'draft')
         RETURNING id, site_id AS "siteId", template_id AS "templateId", inspector_id AS "inspectorId", status, score, submitted_at AS "submittedAt", decided_at AS "decidedAt", created_at AS "createdAt"`,
        [request.user.siteId, input.templateId, request.user.id],
      );
      const items = await client.query(
        'SELECT position, title, photo_required, critical FROM floorwalk.template_items WHERE template_id = $1 ORDER BY position',
        [input.templateId],
      );
      for (const item of items.rows) {
        await client.query(
          `INSERT INTO floorwalk.inspection_items (inspection_id, position, title, photo_required, critical)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            inspection.rows[0].id,
            item.position,
            item.title,
            item.photo_required,
            item.critical,
          ],
        );
      }
      await client.query('COMMIT');
      return inspectionSchema.parse({
        ...inspection.rows[0],
        submittedAt: iso(inspection.rows[0].submittedAt),
        decidedAt: iso(inspection.rows[0].decidedAt),
        createdAt: iso(inspection.rows[0].createdAt),
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.getInspection))
  async getInspection(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    const pool = createPool();
    try {
      const inspection = await this.getInspectionAccess(pool, id, request.user);
      return await this.loadInspectionDetail(pool, inspection);
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Patch(apiRoutePath(apiRoutes.updateInspectionItem))
  async updateItem(
    @Body() body: unknown,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() request: AuthedRequest,
  ) {
    this.assertRole(request.user, ...apiRoutes.updateInspectionItem.roles);
    const input = updateInspectionItemRequestSchema.parse(body);
    const pool = createPool();
    try {
      const inspection = await this.getInspectionAccess(pool, id, request.user);
      const item = await pool.query(
        `UPDATE floorwalk.inspection_items
         SET result = $1, note = $2
         WHERE id = $3 AND inspection_id = $4
         RETURNING id, inspection_id AS "inspectionId", position, title,
           photo_required AS "photoRequired", critical, result, note,
           created_at AS "createdAt"`,
        [input.result, input.note ?? null, itemId, inspection.id],
      );
      if (!item.rows[0])
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '检查项不存在。',
        });
      const evidence = await pool.query(
        `SELECT id, inspection_item_id AS "inspectionItemId", storage_key AS "storageKey",
          mime, size, created_at AS "createdAt"
         FROM floorwalk.evidence WHERE inspection_item_id = $1 ORDER BY created_at`,
        [itemId],
      );
      return updateInspectionItemResponseSchema.parse({
        ...item.rows[0],
        createdAt: iso(item.rows[0].createdAt),
        evidence: evidence.rows.map((row) => ({
          ...row,
          createdAt: iso(row.createdAt),
        })),
      });
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.addEvidence))
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: maxEvidenceSizeBytes } }),
  )
  async addEvidence(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @UploadedFile() file: UploadedImage | undefined,
    @Req() request: AuthedRequest,
  ) {
    this.assertRole(request.user, ...apiRoutes.addEvidence.roles);
    if (!file)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '必须上传 file 字段。',
      });
    evidenceUploadRequestSchema.parse({
      file: {
        fieldName: evidenceUploadFieldName,
        mimetype: file.mimetype,
        size: file.size,
      },
    });
    const pool = createPool();
    try {
      const inspection = await this.getInspectionAccess(pool, id, request.user);
      const item = await pool.query(
        'SELECT id FROM floorwalk.inspection_items WHERE id = $1 AND inspection_id = $2',
        [itemId, inspection.id],
      );
      if (!item.rows[0])
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '检查项不存在。',
        });
      const storageDir = process.env.STORAGE_DIR ?? path.resolve('.storage');
      const storageKey = `${id}/${itemId}-${Date.now()}-${basename(file.originalname)}`;
      const target = path.resolve(storageDir, storageKey);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.buffer);
      const result = await pool.query(
        `INSERT INTO floorwalk.evidence (inspection_item_id, storage_key, mime, size)
         VALUES ($1, $2, $3, $4)
         RETURNING id, inspection_item_id AS "inspectionItemId", storage_key AS "storageKey",
           mime, size, created_at AS "createdAt"`,
        [itemId, storageKey, file.mimetype, file.size],
      );
      return evidenceSchema.parse({
        ...result.rows[0],
        createdAt: iso(result.rows[0].createdAt),
      });
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.getEvidence))
  async getEvidence(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    const pool = createPool();
    try {
      const result = await pool.query<{
        storageKey: string;
        siteId: string;
        inspectorId: string;
      }>(
        `SELECT e.storage_key AS "storageKey", i.site_id AS "siteId", i.inspector_id AS "inspectorId"
         FROM floorwalk.evidence e
         JOIN floorwalk.inspection_items ii ON ii.id = e.inspection_item_id
         JOIN floorwalk.inspections i ON i.id = ii.inspection_id
         WHERE e.id = $1`,
        [id],
      );
      const evidence = result.rows[0];
      if (!evidence)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '照片不存在。',
        });
      this.assertInspectionAccess(evidence, request.user);
      const baseUrl = (
        process.env.API_PUBLIC_BASE_URL ??
        `http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? '3018'}`
      ).replace(/\/$/, '');
      return signedEvidenceResponseSchema.parse({
        url: `${baseUrl}/storage/${encodeURIComponent(evidence.storageKey)}`,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.submitInspection))
  async submit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    this.assertRole(request.user, ...apiRoutes.submitInspection.roles);
    const pool = createPool();
    try {
      const inspection = await this.getInspectionAccess(pool, id, request.user);
      return submitInspectionResponseSchema.parse({
        ...inspection,
        status: 'submitted',
        score: inspection.score ?? 88,
        submittedAt: new Date().toISOString(),
        decidedAt: iso(inspection.decidedAt),
        createdAt: iso(inspection.createdAt),
      });
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.reviewQueue))
  async queue(@Req() request: AuthedRequest) {
    this.assertRole(request.user, ...apiRoutes.reviewQueue.roles);
    const pool = createPool();
    try {
      const result = await pool.query(
        `SELECT id, site_id AS "siteId", template_id AS "templateId", inspector_id AS "inspectorId",
          status, score, submitted_at AS "submittedAt", decided_at AS "decidedAt", created_at AS "createdAt"
         FROM floorwalk.inspections WHERE status IN ('submitted', 'in_review') ORDER BY created_at`,
      );
      const details = await Promise.all(
        result.rows.map((row) => this.loadInspectionDetail(pool, row)),
      );
      return reviewQueueResponseSchema.parse(details);
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.reviewInspection))
  async review(
    @Body() body: unknown,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    this.assertRole(request.user, ...apiRoutes.reviewInspection.roles);
    reviewRequestSchema.parse(body);
    const pool = createPool();
    try {
      const inspection = await this.getInspectionAccess(pool, id, request.user);
      return reviewResponseSchema.parse(
        await this.loadInspectionDetail(pool, inspection),
      );
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.dashboardSites))
  async dashboard(@Req() request: AuthedRequest) {
    this.assertRole(request.user, ...apiRoutes.dashboardSites.roles);
    const pool = createPool();
    try {
      const rows = await pool.query(
        `SELECT s.id, s.code, s.name, s.created_at AS "createdAt", i.score AS "latestScore", i.status AS "latestStatus"
         FROM floorwalk.sites s
         LEFT JOIN LATERAL (
           SELECT score, status FROM floorwalk.inspections
           WHERE site_id = s.id AND status IN ('passed', 'failed')
           ORDER BY decided_at DESC NULLS LAST LIMIT 1
         ) i ON true ORDER BY s.code`,
      );
      return dashboardSitesResponseSchema.parse(
        rows.rows.map((row) => ({
          site: {
            id: row.id,
            code: row.code,
            name: row.name,
            createdAt: iso(row.createdAt),
          },
          latestScore: row.latestScore,
          latestStatus: row.latestStatus,
        })),
      );
    } finally {
      await pool.end();
    }
  }

  private assertRole(user: AuthUser, ...roles: readonly AuthUser['role'][]) {
    if (!roles.includes(user.role))
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '当前角色无权执行此操作。',
      });
  }

  private assertInspectionAccess(
    inspection: { siteId: string; inspectorId: string },
    user: AuthUser,
  ) {
    if (user.role === 'inspector' && inspection.siteId !== user.siteId)
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '只能访问本店巡检单。',
      });
  }

  private async getInspectionAccess(
    pool: ReturnType<typeof createPool>,
    id: string,
    user: AuthUser,
  ) {
    const result = await pool.query(
      'SELECT id, site_id AS "siteId", template_id AS "templateId", inspector_id AS "inspectorId", status, score, submitted_at AS "submittedAt", decided_at AS "decidedAt", created_at AS "createdAt" FROM floorwalk.inspections WHERE id = $1',
      [id],
    );
    if (!result.rows[0])
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '巡检单不存在。',
      });
    this.assertInspectionAccess(result.rows[0], user);
    return result.rows[0];
  }

  private async loadInspectionDetail(
    pool: ReturnType<typeof createPool>,
    inspection: Record<string, unknown>,
  ) {
    const site = await pool.query(
      'SELECT id, code, name, created_at AS "createdAt" FROM floorwalk.sites WHERE id = $1',
      [inspection.siteId],
    );
    if (!site.rows[0])
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '门店不存在。',
      });
    const items = await pool.query(
      `SELECT id, inspection_id AS "inspectionId", position, title, photo_required AS "photoRequired",
        critical, result, note, created_at AS "createdAt"
       FROM floorwalk.inspection_items WHERE inspection_id = $1 ORDER BY position`,
      [inspection.id],
    );
    const detailItems = [];
    for (const item of items.rows) {
      const evidence = await pool.query(
        `SELECT id, inspection_item_id AS "inspectionItemId", storage_key AS "storageKey",
          mime, size, created_at AS "createdAt"
         FROM floorwalk.evidence WHERE inspection_item_id = $1 ORDER BY created_at`,
        [item.id],
      );
      detailItems.push({
        ...item,
        createdAt: iso(item.createdAt),
        evidence: evidence.rows.map((row) => ({
          ...row,
          createdAt: iso(row.createdAt),
        })),
      });
    }
    const reviews = await pool.query(
      `SELECT id, inspection_id AS "inspectionId", reviewer_id AS "reviewerId",
        action, comment, rework_item_ids AS "reworkItemIds", created_at AS "createdAt"
       FROM floorwalk.reviews WHERE inspection_id = $1 ORDER BY created_at ASC, id ASC`,
      [inspection.id],
    );
    return inspectionDetailSchema.parse({
      ...inspection,
      submittedAt: iso(inspection.submittedAt),
      decidedAt: iso(inspection.decidedAt),
      createdAt: iso(inspection.createdAt),
      site: {
        ...site.rows[0],
        createdAt: iso(site.rows[0].createdAt),
      },
      items: detailItems,
      reviews: reviews.rows.map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
      })),
    });
  }
}
