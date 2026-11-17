import {
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  apiRoutePath,
  apiRoutes,
  notificationSchema,
  notificationsQuerySchema,
  notificationsResponseSchema,
  unreadNotificationCountSchema,
} from '@libs/shared';
import type { Pool } from 'pg';
import { AuthGuard } from '../auth/auth.js';
import { DATABASE_POOL } from '../db/pool.provider.js';
import type { AuthedRequest } from '../queries/inspection-queries.js';

type NotificationRow = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: Date | string;
  readAt: Date | string | null;
};

@Controller('api')
export class NotificationsController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.listMyNotifications))
  async list(@Req() request: AuthedRequest) {
    const query = notificationsQuerySchema.parse(request.query);
    const values: unknown[] = [request.user.orgId, request.user.id];
    const filters = ['org_id = $1', 'user_id = $2'];
    if (query.unread_only) filters.push('read_at IS NULL');

    if (query.after) {
      const cursor = await this.pool.query<{ id: string }>(
        `SELECT id FROM floorwalk.notifications
         WHERE org_id = $1 AND user_id = $2 AND id = $3`,
        [request.user.orgId, request.user.id, query.after],
      );
      if (!cursor.rows[0]) throw new NotFoundException();
      values.push(query.after);
      filters.push(
        `(created_at, id) < (SELECT created_at, id FROM floorwalk.notifications WHERE id = $${values.length}::uuid)`,
      );
    }

    values.push(51);
    const result = await this.pool.query<NotificationRow>(
      `SELECT id, type, payload_json AS payload,
          created_at AS "createdAt", read_at AS "readAt"
       FROM floorwalk.notifications
       WHERE ${filters.join(' AND ')}
       ORDER BY created_at DESC, id DESC
       LIMIT $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > 50;
    const notifications = result.rows.slice(0, 50).map((row) =>
      notificationSchema.parse({
        ...row,
        type: row.type,
        payload: row.payload,
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : row.createdAt,
        readAt:
          row.readAt instanceof Date ? row.readAt.toISOString() : row.readAt,
      }),
    );
    return notificationsResponseSchema.parse({
      notifications,
      nextCursor: hasMore ? (notifications.at(-1)?.id ?? null) : null,
    });
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.countMyUnreadNotifications))
  async unreadCount(@Req() request: AuthedRequest) {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM floorwalk.notifications
       WHERE org_id = $1 AND user_id = $2 AND read_at IS NULL`,
      [request.user.orgId, request.user.id],
    );
    return unreadNotificationCountSchema.parse({
      count: Number(result.rows[0]?.count ?? 0),
    });
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.markMyNotificationRead))
  @HttpCode(204)
  async markRead(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    const result = await this.pool.query(
      `UPDATE floorwalk.notifications SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND org_id = $2 AND user_id = $3 RETURNING id`,
      [id, request.user.orgId, request.user.id],
    );
    if (!result.rowCount) throw new NotFoundException();
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.markAllMyNotificationsRead))
  @HttpCode(204)
  async markAllRead(@Req() request: AuthedRequest) {
    await this.pool.query(
      `UPDATE floorwalk.notifications SET read_at = now()
       WHERE org_id = $1 AND user_id = $2 AND read_at IS NULL`,
      [request.user.orgId, request.user.id],
    );
  }
}
