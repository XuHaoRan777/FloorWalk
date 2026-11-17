import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import sharp from 'sharp';
import {
  apiRoutePath,
  apiRoutes,
  avatarUploadFieldName,
  avatarUploadRequestSchema,
  avatarUploadResponseSchema,
  maxAvatarSizeBytes,
  updateMeRequestSchema,
  userSchema,
} from '@libs/shared';
import { AuthGuard } from '../auth/auth.js';
import { DATABASE_POOL } from '../db/pool.provider.js';
import {
  assertRole,
  type AuthedRequest,
  type UploadedImage,
} from '../queries/inspection-queries.js';
import type { StorageDriver } from '../storage/types.js';

@Controller('api')
@UseGuards(AuthGuard)
export class ProfileController {
  private readonly logger = new Logger(ProfileController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject('STORAGE_DRIVER') private readonly storage: StorageDriver,
  ) {}

  @Patch(apiRoutePath(apiRoutes.updateMe))
  async updateMe(@Body() body: unknown, @Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.updateMe.roles);
    const input = updateMeRequestSchema.parse(body);
    const result = await this.pool.query(
      `WITH updated AS (
         UPDATE floorwalk.users SET display_name = $2
         WHERE id = $1 AND org_id = $3 RETURNING *
       )
       SELECT u.id, u.login_name AS "loginName", u.display_name AS "displayName",
         u.role, u.site_id AS "siteId",
         u.must_change_password AS "mustChangePassword", u.created_at AS "createdAt",
         json_build_object('id', o.id, 'name', o.name) AS org
       FROM updated u JOIN floorwalk.organizations o ON o.id = u.org_id`,
      [request.user.id, input.displayName, request.user.orgId],
    );
    const row = result.rows[0];
    if (!row) throw this.userNotFound();
    return userSchema.parse({
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
    });
  }

  @Post(apiRoutePath(apiRoutes.uploadAvatar))
  @UseInterceptors(
    FileInterceptor(avatarUploadFieldName, {
      limits: { fileSize: maxAvatarSizeBytes + 1 },
    }),
  )
  async uploadAvatar(
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: UploadedImage | undefined,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.uploadAvatar.roles);
    if (!file)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '请选择 jpeg 或 png 头像。',
      });
    avatarUploadRequestSchema.parse({
      ...body,
      file: {
        fieldName: avatarUploadFieldName,
        mimetype: file.mimetype,
        size: file.size,
      },
    });
    const metadata = await sharp(file.buffer)
      .metadata()
      .catch(() => null);
    const format = file.mimetype === 'image/jpeg' ? 'jpeg' : 'png';
    if (metadata?.format !== format)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '头像文件必须是有效的 jpeg 或 png 图片。',
      });

    const extension = format === 'jpeg' ? 'jpg' : 'png';
    const storageKey = `org/${request.user.orgId}/avatars/${request.user.id}/${randomUUID()}.${extension}`;
    const client = await this.pool.connect();
    let committed = false;
    let written = false;
    try {
      await client.query('BEGIN');
      const current = await client.query<{ avatarStorageKey: string | null }>(
        `SELECT avatar_storage_key AS "avatarStorageKey" FROM floorwalk.users
         WHERE id = $1 AND org_id = $2 FOR UPDATE`,
        [request.user.id, request.user.orgId],
      );
      const row = current.rows[0];
      if (!row) throw this.userNotFound();
      await this.storage.put(storageKey, file.buffer, file.mimetype);
      written = true;
      await client.query(
        'UPDATE floorwalk.users SET avatar_storage_key = $2 WHERE id = $1',
        [request.user.id, storageKey],
      );
      await client.query('COMMIT');
      committed = true;
      if (row.avatarStorageKey)
        await this.deletePreviousAvatar(row.avatarStorageKey);
      return avatarUploadResponseSchema.parse({ storageKey });
    } catch (error) {
      if (!committed) {
        await client.query('ROLLBACK');
        if (written)
          await this.storage.delete(storageKey).catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async deletePreviousAvatar(storageKey: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.storage.delete(storageKey);
        return;
      } catch {
        if (attempt < 2) continue;
        this.logger.error({ event: 'avatar_cleanup_failed', storageKey });
        throw new InternalServerErrorException({
          message: '头像更新未能完成，请稍后重试。',
        });
      }
    }
  }

  private userNotFound() {
    return new NotFoundException({
      code: 'NOT_FOUND',
      message: '用户不存在。',
    });
  }
}
