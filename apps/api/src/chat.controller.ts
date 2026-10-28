import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Body,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  apiRoutePath,
  apiRoutes,
  chatImageUrlResponseSchema,
  chatMessageRequestSchema,
  chatMessageSchema,
  chatMessagesResponseSchema,
  maxEvidenceSizeBytes,
  type UserRole,
} from '@libs/shared';
import { unlink, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Pool } from 'pg';
import { AuthGuard } from './auth.js';
import { DATABASE_POOL } from './db/pool.provider.js';
import {
  assertInspectionAccess,
  assertRole,
  evidenceSignature,
  iso,
  type AuthedRequest,
  type UploadedImage,
} from './inspection-queries.js';

type ChatRow = {
  id: string;
  seq: string;
  inspectionId: string;
  authorId: string;
  displayName?: string;
  role?: UserRole;
  body: string | null;
  storageKey: string | null;
  createdAt: Date | string;
};

@Controller('api')
export class ChatController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.listInspectionMessages))
  async listMessages(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.listInspectionMessages.roles);
    const query = apiRoutes.listInspectionMessages.requestSchema!.parse({
      after: request.query.after,
      before: request.query.before,
      limit: request.query.limit,
    }) as { after?: string; before?: string; limit: number };
    const inspection = await this.getInspection(id);
    assertInspectionAccess(inspection, request.user);

    const direction =
      query.before !== undefined
        ? 'before'
        : query.after !== undefined
          ? 'after'
          : 'latest';
    const anchor = query.before ?? query.after ?? null;
    const order =
      direction === 'before' || direction === 'latest' ? 'DESC' : 'ASC';
    const comparison =
      direction === 'before' ? '<' : direction === 'after' ? '>' : undefined;
    const where = comparison ? `AND m.seq ${comparison} $2::bigint` : '';
    const values =
      anchor === null ? [id, query.limit + 1] : [id, anchor, query.limit + 1];
    const limitIndex = anchor === null ? '$2' : '$3';
    const result = await this.pool.query<ChatRow>(
      `SELECT m.id, m.seq::text AS seq, m.inspection_id AS "inspectionId",
          m.author_id AS "authorId", u.display_name AS "displayName", u.role,
          m.body, m.storage_key AS "storageKey", m.created_at AS "createdAt"
       FROM floorwalk.chat_messages m
       JOIN floorwalk.users u ON u.id = m.author_id
       WHERE m.inspection_id = $1 ${where}
       ORDER BY m.seq ${order} LIMIT ${limitIndex}`,
      values,
    );
    const hasExtra = result.rows.length > query.limit;
    const rows = result.rows.slice(0, query.limit);
    if (direction === 'before' || direction === 'latest') rows.reverse();
    const messages = rows.map((row) => this.toMessage(row));
    let hasMoreBefore =
      direction === 'before' || direction === 'latest' ? hasExtra : false;
    if (direction === 'after' && rows[0]) {
      const earlier = await this.pool.query(
        'SELECT EXISTS (SELECT 1 FROM floorwalk.chat_messages WHERE inspection_id = $1 AND seq < $2::bigint) AS exists',
        [id, rows[0].seq],
      );
      hasMoreBefore = earlier.rows[0]?.exists ?? false;
    }
    return chatMessagesResponseSchema.parse({ messages, hasMoreBefore });
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.createInspectionMessage))
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: maxEvidenceSizeBytes } }),
  )
  async createMessage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @UploadedFile() file: UploadedImage | undefined,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.createInspectionMessage.roles);
    const input = chatMessageRequestSchema.parse({
      ...(typeof body === 'object' && body !== null ? body : {}),
      ...(file ? { file: { mimetype: file.mimetype, size: file.size } } : {}),
    });
    const inspection = await this.getInspection(id);
    assertInspectionAccess(inspection, request.user);

    let storageKey: string | null = null;
    let target: string | undefined;
    if (file) {
      const extension = file.mimetype === 'image/jpeg' ? '.jpg' : '.png';
      storageKey = `chat/${id}/${randomUUID()}${extension}`;
      const storageDir = process.env.STORAGE_DIR ?? path.resolve('.storage');
      target = path.resolve(storageDir, storageKey);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.buffer);
    }
    try {
      const result = await this.pool.query<ChatRow>(
        `INSERT INTO floorwalk.chat_messages
          (inspection_id, author_id, body, storage_key, mime, size)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, seq::text AS seq, inspection_id AS "inspectionId",
           author_id AS "authorId", body, storage_key AS "storageKey", created_at AS "createdAt"`,
        [
          id,
          request.user.id,
          input.text ?? null,
          storageKey,
          file?.mimetype ?? null,
          file?.size ?? null,
        ],
      );
      return chatMessageSchema.parse(
        this.toMessage({
          ...result.rows[0],
          displayName: request.user.displayName,
          role: request.user.role,
        }),
      );
    } catch (error) {
      if (target) await unlink(target).catch(() => undefined);
      throw error;
    }
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.getMessageImageUrl))
  async getMessageImageUrl(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.getMessageImageUrl.roles);
    const result = await this.pool.query(
      `SELECT m.storage_key AS "storageKey", i.site_id AS "siteId",
          i.inspector_id AS "inspectorId"
       FROM floorwalk.chat_messages m
       JOIN floorwalk.inspections i ON i.id = m.inspection_id
       WHERE m.id = $1`,
      [id],
    );
    const message = result.rows[0];
    if (!message || !message.storageKey)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '聊天图片不存在。',
      });
    assertInspectionAccess(message, request.user);
    return chatImageUrlResponseSchema.parse(this.signImage(message.storageKey));
  }

  private async getInspection(id: string) {
    const result = await this.pool.query(
      'SELECT id, site_id AS "siteId", inspector_id AS "inspectorId" FROM floorwalk.inspections WHERE id = $1',
      [id],
    );
    if (!result.rows[0])
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '巡检单不存在。',
      });
    return result.rows[0];
  }

  private toMessage(row: ChatRow) {
    const image = row.storageKey ? this.signImage(row.storageKey).url : null;
    return {
      id: row.id,
      seq: String(row.seq),
      inspectionId: row.inspectionId,
      authorId: row.authorId,
      displayName: row.displayName,
      role: row.role,
      body: row.body,
      imageUrl: image,
      createdAt: iso(row.createdAt),
    };
  }

  private signImage(storageKey: string) {
    const baseUrl = (
      process.env.API_PUBLIC_BASE_URL ??
      `http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? '3018'}`
    ).replace(/\/$/, '');
    const expiresAt = Date.now() + 60 * 60 * 1000;
    return {
      url: `${baseUrl}/storage/${encodeURIComponent(storageKey)}?expires=${expiresAt}&signature=${evidenceSignature(storageKey, expiresAt)}`,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }
}
