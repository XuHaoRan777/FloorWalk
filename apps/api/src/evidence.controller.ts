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
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import {
  apiRoutePath,
  apiRoutes,
  evidenceUploadFieldName,
  evidenceUploadRequestSchema,
  evidenceSchema,
  maxEvidenceSizeBytes,
  signedEvidenceResponseSchema,
} from '@libs/shared';
import { DATABASE_POOL } from './db/pool.provider.js';
import type { Pool } from 'pg';
import { AuthGuard } from './auth.js';
import {
  type AuthedRequest,
  type UploadedImage,
  iso,
  assertRole,
  assertInspectionAccess,
} from './inspection-queries.js';
import { getStorageDriver } from './storage/index.js';

@Controller('api')
export class EvidenceController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

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
    const pool = this.pool;
    const storage = await getStorageDriver();
    const client = await pool.connect();
    let writtenKey: string | undefined;
    let committed = false;
    try {
      await client.query('BEGIN');
      const inspectionResult = await client.query(
        `SELECT i.id, i.site_id AS "siteId", i.inspector_id AS "inspectorId", i.status,
            s.org_id AS "orgId", ss.user_id AS "supervisorUserId"
         FROM floorwalk.inspections i JOIN floorwalk.sites s ON s.id = i.site_id
         LEFT JOIN floorwalk.site_supervisors ss ON ss.site_id = s.id
         WHERE i.id = $1 FOR UPDATE OF i`,
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
      const extension = file.mimetype === 'image/jpeg' ? '.jpg' : '.png';
      const storageKey = `org/${request.user.orgId}/${id}/${randomUUID()}${extension}`;
      writtenKey = storageKey;
      await storage.put(storageKey, file.buffer, file.mimetype);
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
        if (writtenKey) await storage.delete(writtenKey).catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.getEvidence))
  async getEvidence(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    const result = await this.pool.query<{
      storageKey: string;
      id: string;
      siteId: string;
      inspectorId: string;
      orgId: string;
      supervisorUserId: string | null;
    }>(
      `SELECT e.storage_key AS "storageKey", i.id, i.site_id AS "siteId", i.inspector_id AS "inspectorId",
          s.org_id AS "orgId", ss.user_id AS "supervisorUserId"
         FROM floorwalk.evidence e
         JOIN floorwalk.inspection_items ii ON ii.id = e.inspection_item_id
         JOIN floorwalk.inspections i ON i.id = ii.inspection_id
         JOIN floorwalk.sites s ON s.id = i.site_id
         LEFT JOIN floorwalk.site_supervisors ss ON ss.site_id = s.id
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
    const storage = await getStorageDriver();
    return signedEvidenceResponseSchema.parse(
      await storage.signedUrl(evidence.storageKey, 3600),
    );
  }
}
