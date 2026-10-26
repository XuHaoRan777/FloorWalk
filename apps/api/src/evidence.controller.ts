import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  apiRoutePath,
  apiRoutes,
  evidenceUploadFieldName,
  evidenceUploadRequestSchema,
  evidenceSchema,
  maxEvidenceSizeBytes,
  signedEvidenceResponseSchema,
} from '@libs/shared';
import { createPool } from './db/client.js';
import { AuthGuard } from './auth.js';
import {
  type AuthedRequest,
  type UploadedImage,
  iso,
  evidenceSignature,
  assertRole,
  assertInspectionAccess,
} from './inspection-queries.js';

@Controller('api')
export class EvidenceController {
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
    assertRole(request.user, ...apiRoutes.addEvidence.roles);
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
    const client = await pool.connect();
    let target: string | undefined;
    let committed = false;
    try {
      await client.query('BEGIN');
      const inspectionResult = await client.query(
        'SELECT id, site_id AS "siteId", inspector_id AS "inspectorId", status FROM floorwalk.inspections WHERE id = $1 FOR UPDATE',
        [id],
      );
      const inspection = inspectionResult.rows[0];
      if (!inspection)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '巡检单不存在。',
        });
      assertInspectionAccess(inspection, request.user);
      if (inspection.status !== 'draft' && inspection.status !== 'rework')
        throw new ConflictException({
          code: 'INVALID_STATE',
          message: '只有草稿或打回状态的巡检单可以上传照片。',
        });
      const item = await client.query(
        'SELECT id FROM floorwalk.inspection_items WHERE id = $1 AND inspection_id = $2',
        [itemId, inspection.id],
      );
      if (!item.rows[0])
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '检查项不存在。',
        });
      const storageDir = process.env.STORAGE_DIR ?? path.resolve('.storage');
      const extension = file.mimetype === 'image/jpeg' ? '.jpg' : '.png';
      const storageKey = `${id}/${randomUUID()}${extension}`;
      target = path.resolve(storageDir, storageKey);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.buffer);
      const result = await client.query(
        `INSERT INTO floorwalk.evidence (inspection_item_id, storage_key, mime, size)
         VALUES ($1, $2, $3, $4)
         RETURNING id, inspection_item_id AS "inspectionItemId", storage_key AS "storageKey",
           mime, size, created_at AS "createdAt"`,
        [itemId, storageKey, file.mimetype, file.size],
      );
      const response = evidenceSchema.parse({
        ...result.rows[0],
        createdAt: iso(result.rows[0].createdAt),
      });
      await client.query('COMMIT');
      committed = true;
      return response;
    } catch (error) {
      if (!committed) {
        await client.query('ROLLBACK');
        if (target) await unlink(target).catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
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
      assertInspectionAccess(evidence, request.user);
      const baseUrl = (
        process.env.API_PUBLIC_BASE_URL ??
        `http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? '3018'}`
      ).replace(/\/$/, '');
      const expiresAt = Date.now() + 60 * 60 * 1000;
      return signedEvidenceResponseSchema.parse({
        url: `${baseUrl}/storage/${encodeURIComponent(evidence.storageKey)}?expires=${expiresAt}&signature=${evidenceSignature(evidence.storageKey, expiresAt)}`,
        expiresAt: new Date(expiresAt).toISOString(),
      });
    } finally {
      await pool.end();
    }
  }
}
