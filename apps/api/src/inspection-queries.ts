import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import { inspectionDetailSchema } from '@libs/shared';
import { createPool } from './db/client.js';
import { getJwtSecret, type AuthUser } from './auth.js';

export type AuthedRequest = Request & { user: AuthUser };
export type UploadedImage = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
export const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : value;

export const evidenceSignature = (storageKey: string, expiresAt: number) =>
  createHmac('sha256', getJwtSecret())
    .update(`${storageKey}.${expiresAt}`)
    .digest('hex');

export function getShanghaiDayBounds(now = new Date()) {
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

export function assertRole(
  user: AuthUser,
  ...roles: readonly AuthUser['role'][]
) {
  if (!roles.includes(user.role))
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: '当前角色无权执行此操作。',
    });
}

export function assertInspectionAccess(
  inspection: { siteId: string; inspectorId: string },
  user: AuthUser,
) {
  if (user.role === 'inspector' && inspection.siteId !== user.siteId)
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: '只能访问本店巡检单。',
    });
}

export async function getInspectionAccess(
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
  assertInspectionAccess(result.rows[0], user);
  return result.rows[0];
}

export async function loadInspectionDetail(
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
