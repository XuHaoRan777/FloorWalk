import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  apiRoutePath,
  apiRoutes,
  inspectorRecordsResponseSchema,
} from '@libs/shared';
import { z } from 'zod';
import type { Pool } from 'pg';
import { AuthGuard } from './auth.js';
import { DATABASE_POOL } from './db/pool.provider.js';
import { assertRole, iso, type AuthedRequest } from './inspection-queries.js';

const cursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

@Controller('api')
export class RecordsController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.listInspectorInspections))
  async listInspections(
    @Query('cursor') cursor: string | undefined,
    @Query('limit') rawLimit: string | undefined,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.listInspectorInspections.roles);
    if (!request.user.siteId)
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '店员未绑定门店。',
      });

    const limit = rawLimit === undefined ? 10 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'limit 必须是 1 到 50 的整数。',
      });

    let boundary: z.infer<typeof cursorSchema> | undefined;
    if (cursor !== undefined) {
      try {
        boundary = cursorSchema.parse(
          JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
        );
      } catch {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'cursor 无效。',
        });
      }
    }

    const rows = await this.pool.query(
      `SELECT id, status, score, created_at AS "createdAt",
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorCreatedAt",
          submitted_at AS "submittedAt", decided_at AS "decidedAt"
       FROM floorwalk.inspections
       WHERE site_id = $1
         AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::uuid))
       ORDER BY created_at DESC, id DESC LIMIT $4`,
      [
        request.user.siteId,
        boundary?.createdAt ?? null,
        boundary?.id ?? null,
        limit + 1,
      ],
    );
    const hasMore = rows.rows.length > limit;
    const items = rows.rows.slice(0, limit).map((row) => ({
      id: row.id,
      status: row.status,
      score: row.score,
      createdAt: iso(row.createdAt),
      submittedAt: iso(row.submittedAt),
      decidedAt: iso(row.decidedAt),
    }));
    const last = rows.rows[limit - 1];
    return inspectorRecordsResponseSchema.parse({
      items,
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({
                createdAt: last.cursorCreatedAt,
                id: last.id,
              }),
            ).toString('base64url')
          : null,
    });
  }
}
