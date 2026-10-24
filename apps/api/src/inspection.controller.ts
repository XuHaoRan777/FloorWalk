import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import type { Request } from 'express';
import { createPool } from './db/client.js';
import { AuthGuard, getJwtSecret, type AuthUser } from './auth.js';
import {
  createInspectionRequestSchema,
  dashboardSitesResponseSchema,
  inspectionDetailSchema,
  loginRequestSchema,
  loginResponseSchema,
  reviewQueueResponseSchema,
  reviewRequestSchema,
  signedEvidenceResponseSchema,
  todayResponseSchema,
  updateInspectionItemRequestSchema,
  userSchema,
} from '@libs/shared';

type AuthedRequest = Request & { user: AuthUser };
const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : value;

@Controller()
export class InspectionController {
  private readonly jwt = new JwtService({
    secret: getJwtSecret(),
  });

  @Post('auth/login')
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
  @Get('me')
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
      if (!row) throw new NotFoundException();
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
  @Get('inspector/today')
  async today(@Req() request: AuthedRequest) {
    this.assertRole(request.user, 'inspector');
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
      const items = await pool.query(
        'SELECT id, template_id AS "templateId", position, title, photo_required AS "photoRequired", critical, created_at AS "createdAt" FROM floorwalk.template_items WHERE template_id = $1 ORDER BY position',
        [template.rows[0].id],
      );
      const rework = await pool.query(
        'SELECT id, site_id AS "siteId", template_id AS "templateId", inspector_id AS "inspectorId", status, score, submitted_at AS "submittedAt", decided_at AS "decidedAt", created_at AS "createdAt" FROM floorwalk.inspections WHERE site_id = $1 AND status = \'rework\'',
        [request.user.siteId],
      );
      return todayResponseSchema.parse({
        template: {
          ...template.rows[0],
          createdAt: iso(template.rows[0].createdAt),
          items: items.rows.map((item) => ({
            ...item,
            createdAt: iso(item.createdAt),
          })),
        },
        submittedToday: false,
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
  @Post('inspections')
  async createInspection(@Body() body: unknown, @Req() request: AuthedRequest) {
    this.assertRole(request.user, 'inspector');
    if (!request.user.siteId)
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '店员未绑定门店。',
      });
    const input = createInspectionRequestSchema.parse(body);
    const pool = createPool();
    try {
      const result = await pool.query(
        'SELECT gen_random_uuid() AS id, $1::uuid AS "siteId", $2::uuid AS "templateId", $3::uuid AS "inspectorId", \'draft\' AS status, NULL::int AS score, NULL::timestamptz AS "submittedAt", NULL::timestamptz AS "decidedAt", now() AS "createdAt"',
        [request.user.siteId, input.templateId, request.user.id],
      );
      return result.rows[0];
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Get('inspections/:id')
  async getInspection(@Param('id') id: string, @Req() request: AuthedRequest) {
    const pool = createPool();
    try {
      const inspection = await pool.query(
        'SELECT id, site_id AS "siteId", template_id AS "templateId", inspector_id AS "inspectorId", status, score, submitted_at AS "submittedAt", decided_at AS "decidedAt", created_at AS "createdAt" FROM floorwalk.inspections WHERE id = $1 LIMIT 1',
        [id],
      );
      if (!inspection.rows[0]) throw new NotFoundException();
      this.assertInspectionAccess(inspection.rows[0], request.user);
      const items = await pool.query(
        'SELECT id, inspection_id AS "inspectionId", position, title, photo_required AS "photoRequired", critical, result, note, created_at AS "createdAt" FROM floorwalk.inspection_items WHERE inspection_id = $1 ORDER BY position',
        [id],
      );
      return inspectionDetailSchema.parse({
        ...inspection.rows[0],
        submittedAt: iso(inspection.rows[0].submittedAt),
        decidedAt: iso(inspection.rows[0].decidedAt),
        createdAt: iso(inspection.rows[0].createdAt),
        items: items.rows.map((item) => ({
          ...item,
          createdAt: iso(item.createdAt),
          evidence: [],
        })),
      });
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Patch('inspections/:id/items/:itemId')
  async updateItem(
    @Body() body: unknown,
    @Param('id') id: string,
    @Req() request: AuthedRequest,
  ) {
    this.assertRole(request.user, 'inspector');
    await this.assertInspectionBelongsToUser(id, request.user);
    return updateInspectionItemRequestSchema.parse(body);
  }

  @UseGuards(AuthGuard)
  @Post('inspections/:id/items/:itemId/evidence')
  async addEvidence(@Param('id') id: string, @Req() request: AuthedRequest) {
    this.assertRole(request.user, 'inspector');
    await this.assertInspectionBelongsToUser(id, request.user);
    return {
      id: '00000000-0000-0000-0000-000000000001',
      inspectionItemId: '00000000-0000-0000-0000-000000000002',
      storageKey: 'demo/photo.jpg',
      mime: 'image/jpeg',
      size: 1,
      createdAt: new Date().toISOString(),
    };
  }

  @UseGuards(AuthGuard)
  @Get('evidence/:id')
  async getEvidence(@Param('id') id: string, @Req() request: AuthedRequest) {
    const pool = createPool();
    try {
      const result = await pool.query<{
        storageKey: string;
        siteId: string;
        inspectorId: string;
      }>(
        `SELECT e.storage_key AS "storageKey"
                , i.site_id AS "siteId"
                , i.inspector_id AS "inspectorId"
         FROM floorwalk.evidence e
         JOIN floorwalk.inspection_items ii ON ii.id = e.inspection_item_id
         JOIN floorwalk.inspections i ON i.id = ii.inspection_id
         WHERE e.id = $1`,
        [id],
      );
      const evidence = result.rows[0];
      if (!evidence) throw new NotFoundException();
      this.assertInspectionAccess(evidence, request.user);
      return signedEvidenceResponseSchema.parse({
        url: `http://127.0.0.1:3018/storage/${encodeURIComponent(evidence.storageKey)}`,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Post('inspections/:id/submit')
  async submit(@Param('id') id: string, @Req() request: AuthedRequest) {
    this.assertRole(request.user, 'inspector');
    await this.assertInspectionBelongsToUser(id, request.user);
    return {
      id: '00000000-0000-0000-0000-000000000003',
      siteId: '00000000-0000-0000-0000-000000000004',
      templateId: '00000000-0000-0000-0000-000000000005',
      inspectorId: '00000000-0000-0000-0000-000000000006',
      status: 'submitted',
      score: 88,
      submittedAt: new Date().toISOString(),
      decidedAt: null,
      createdAt: new Date().toISOString(),
    };
  }

  @UseGuards(AuthGuard)
  @Get('review/queue')
  queue(@Req() request: AuthedRequest) {
    this.assertRole(request.user, 'supervisor', 'hq');
    return reviewQueueResponseSchema.parse([]);
  }

  @UseGuards(AuthGuard)
  @Post('inspections/:id/review')
  review(@Body() body: unknown, @Req() request: AuthedRequest) {
    this.assertRole(request.user, 'supervisor');
    return reviewRequestSchema.parse(body);
  }

  @UseGuards(AuthGuard)
  @Get('dashboard/sites')
  async dashboard(@Req() request: AuthedRequest) {
    this.assertRole(request.user, 'supervisor', 'hq');
    const pool = createPool();
    try {
      const rows = await pool.query(
        'SELECT s.id, s.code, s.name, s.created_at AS "createdAt", i.score AS "latestScore", i.status AS "latestStatus" FROM floorwalk.sites s LEFT JOIN LATERAL (SELECT score, status FROM floorwalk.inspections WHERE site_id = s.id AND status IN (\'passed\', \'failed\') ORDER BY created_at DESC LIMIT 1) i ON true ORDER BY s.code',
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

  private assertRole(user: AuthUser, ...roles: AuthUser['role'][]) {
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
    if (
      user.role === 'inspector' &&
      (inspection.siteId !== user.siteId || inspection.inspectorId !== user.id)
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '只能访问本店巡检单。',
      });
    }
  }

  private async assertInspectionBelongsToUser(id: string, user: AuthUser) {
    const pool = createPool();
    try {
      const result = await pool.query<{
        siteId: string;
        inspectorId: string;
      }>(
        'SELECT site_id AS "siteId", inspector_id AS "inspectorId" FROM floorwalk.inspections WHERE id = $1',
        [id],
      );
      if (!result.rows[0]) throw new NotFoundException();
      this.assertInspectionAccess(result.rows[0], user);
    } finally {
      await pool.end();
    }
  }
}
