import { randomUUID } from 'node:crypto';
import { expect, request as playwrightRequest, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';
import { getStorageDriver } from '../../apps/api/src/storage/index.js';
import { getSlotDatabaseUrl, storageDir } from './slot.js';

const password = 'initial-password';
const changedPassword = 'changed-password';
const jpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//9k=',
  'base64',
);

async function expectOk(
  response: Awaited<ReturnType<APIRequestContext['get']>>,
) {
  const body = await response.text();
  expect(response.ok(), body).toBe(true);
  return body ? JSON.parse(body) : undefined;
}

test('g03 cross-line tenant onboarding, first login, task photo storage and isolation', async ({
  request,
}) => {
  const unique = randomUUID();
  const orgName = `FW023-${unique}`;
  const adminEmail = `fw023-admin-${unique}@example.test`;
  const inspectorEmail = `fw023-inspector-${unique}@example.test`;
  const siteCode = `FW-${unique.slice(0, 8)}`;
  const pool = createPool(getSlotDatabaseUrl());
  const storage = await getStorageDriver(storageDir);
  const storedKeys: string[] = [];
  let orgId: string | undefined;
  let managerId: string | undefined;
  let scheduleId: string | undefined;
  let taskId: string | undefined;
  let inspectionId: string | undefined;

  try {
    await expectOk(
      await request.post('/api/auth/registration-code', {
        data: { email: adminEmail },
      }),
    );
    const registrationCode = await expectOk(
      await request.get('/api/testing/mailbox', {
        params: { recipient: adminEmail },
      }),
    );
    const registration = await expectOk(
      await request.post('/api/orgs', {
        data: {
          orgName,
          adminName: 'FW-023 管理员',
          email: adminEmail,
          password,
          verificationCode: registrationCode.code,
        },
      }),
    );
    orgId = registration.org.id;
    const adminCookie = (await request.storageState()).cookies.find(
      (cookie) => cookie.name === 'fw_session',
    );
    expect(adminCookie).toBeTruthy();

    const createSiteResponse = await request.post('/api/admin/sites', {
      data: { code: siteCode, name: 'FW-023 演示门店' },
    });
    const site = await expectOk(createSiteResponse);
    const templateResponse = await request.post('/api/admin/templates', {
      data: {
        name: 'FW-023 巡检模板',
        aiEnabled: false,
        items: [
          {
            title: '门店照片',
            minPhotoCount: 1,
            acceptanceCriteria: '照片清晰展示门店现场。',
            critical: false,
          },
          {
            title: '地面整洁',
            minPhotoCount: 0,
            acceptanceCriteria: '地面整洁无杂物。',
            critical: false,
          },
        ],
      },
    });
    const template = await expectOk(templateResponse);
    const manager = await expectOk(
      await request.post('/api/admin/users', {
        data: {
          loginName: inspectorEmail,
          displayName: 'FW-023 店员',
          role: 'store_manager',
          siteId: site.id,
          password,
        },
      }),
    );
    managerId = manager.id;

    const weekday =
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Shanghai',
          weekday: 'short',
        }).format(new Date()),
      ) + 1;
    const schedule = await expectOk(
      await request.post('/api/admin/schedules', {
        data: {
          name: 'FW-023 每日巡检日程',
          days: Array.from({ length: 7 }, (_, index) => ({
            weekday: index + 1,
            enabled: index + 1 === weekday,
            tasks:
              index + 1 === weekday
                ? [
                    {
                      templateId: template.id,
                      startsAt: '00:00',
                      endsAt: '23:59',
                    },
                  ]
                : [],
          })),
        },
      }),
    );
    scheduleId = schedule.id;
    await expectOk(
      await request.put('/api/admin/site-schedules', {
        data: { siteIds: [site.id], scheduleId },
      }),
    );

    const staffContext = await playwrightRequest.newContext({
      baseURL: test.info().project.use.baseURL as string,
    });
    try {
      await expectOk(
        await staffContext.post('/api/auth/session', {
          data: { loginName: inspectorEmail, password },
        }),
      );
      await expectOk(
        await staffContext.post('/api/me/password', {
          data: { currentPassword: password, newPassword: changedPassword },
        }),
      );
      const taskDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const taskResult = await pool.query<{ id: string }>(
        `SELECT id FROM floorwalk.inspection_tasks
         WHERE org_id = $1 AND site_id = $2 AND template_id = $3
           AND task_date = $4::date
         ORDER BY created_at DESC LIMIT 1`,
        [orgId, site.id, template.id, taskDate],
      );
      taskId = taskResult.rows[0]?.id;
      expect(taskId).toBeTruthy();
      if (!taskId) throw new Error('当天日程没有生成巡检任务。');

      const templateItems = await pool.query<{
        position: number;
        minPhotoCount: number;
      }>(
        `SELECT position, min_photo_count AS "minPhotoCount"
         FROM floorwalk.template_items WHERE template_id = $1 ORDER BY position`,
        [template.id],
      );
      for (const item of templateItems.rows) {
        const upload = await expectOk(
          await staffContext.post(
            `/api/tasks/${taskId}/items/${item.position}/uploads`,
            {
              multipart: {
                selfAssessment: 'pass',
                ...(item.minPhotoCount === 0 ? { note: '现场已检查。' } : {}),
                ...(item.minPhotoCount > 0
                  ? {
                      files: {
                        name: 'evidence.jpg',
                        mimeType: 'image/jpeg',
                        buffer: jpeg,
                      },
                    }
                  : {}),
              },
            },
          ),
        );
        inspectionId ??= upload.inspectionId;
        expect(upload.inspectionId).toBe(inspectionId);
        for (const evidence of upload.evidence) {
          storedKeys.push(evidence.storageKey);
          expect(evidence.storageKey).toMatch(new RegExp(`^org/${orgId}/`));
        }
      }
      expect(inspectionId).toBeTruthy();
      if (!inspectionId) throw new Error('首传没有创建巡检记录。');

      const northbeanContext = await playwrightRequest.newContext({
        baseURL: test.info().project.use.baseURL as string,
      });
      try {
        await expectOk(
          await northbeanContext.post('/api/auth/session', {
            data: {
              loginName: 'hq@northbean.example',
              password: 'northbean-demo',
            },
          }),
        );
        const northbeanSites = await expectOk(
          await northbeanContext.get('/api/admin/sites'),
        );
        expect(northbeanSites).toHaveLength(12);
        expect(
          northbeanSites.some(
            (entry: { code: string }) => entry.code === siteCode,
          ),
        ).toBe(false);
        expect(
          (
            await northbeanContext.get(`/api/inspections/${inspectionId}`)
          ).status(),
        ).toBe(404);
      } finally {
        await northbeanContext.dispose();
      }
    } finally {
      await staffContext.dispose();
    }
    expect(manager.mustChangePassword).toBe(true);
  } finally {
    for (const key of storedKeys)
      await storage.delete(key).catch(() => undefined);
    await pool.query(
      'DELETE FROM floorwalk.email_verifications WHERE email = $1',
      [adminEmail],
    );
    if (orgId) {
      await pool.query('BEGIN');
      await pool.query(
        `DELETE FROM floorwalk.reviews r USING floorwalk.inspections i, floorwalk.sites s
         WHERE r.inspection_id = i.id AND i.site_id = s.id AND s.org_id = $1`,
        [orgId],
      );
      await pool.query(
        `DELETE FROM floorwalk.inspection_item_decisions decision
         USING floorwalk.inspection_items item, floorwalk.inspections inspection,
           floorwalk.inspection_tasks task
         WHERE decision.inspection_item_id = item.id
           AND item.inspection_id = inspection.id AND inspection.task_id = task.id
           AND task.org_id = $1`,
        [orgId],
      );
      await pool.query(
        `DELETE FROM floorwalk.inspection_participants participant
         USING floorwalk.inspections inspection, floorwalk.inspection_tasks task
         WHERE participant.inspection_id = inspection.id
           AND inspection.task_id = task.id AND task.org_id = $1`,
        [orgId],
      );
      if (managerId)
        await pool.query('DELETE FROM floorwalk.sessions WHERE user_id = $1', [
          managerId,
        ]);
      await pool.query(
        `DELETE FROM floorwalk.chat_messages m USING floorwalk.inspections i, floorwalk.sites s
         WHERE m.inspection_id = i.id AND i.site_id = s.id AND s.org_id = $1`,
        [orgId],
      );
      await pool.query(
        `DELETE FROM floorwalk.evidence e USING floorwalk.inspection_items ii, floorwalk.inspections i, floorwalk.sites s
         WHERE e.inspection_item_id = ii.id AND ii.inspection_id = i.id AND i.site_id = s.id AND s.org_id = $1`,
        [orgId],
      );
      await pool.query(
        `DELETE FROM floorwalk.inspection_items ii USING floorwalk.inspections i, floorwalk.sites s
         WHERE ii.inspection_id = i.id AND i.site_id = s.id AND s.org_id = $1`,
        [orgId],
      );
      await pool.query(
        `DELETE FROM floorwalk.inspections i USING floorwalk.sites s
         WHERE i.site_id = s.id AND s.org_id = $1`,
        [orgId],
      );
      await pool.query(
        'DELETE FROM floorwalk.inspection_tasks WHERE org_id = $1',
        [orgId],
      );
      await pool.query(
        'DELETE FROM floorwalk.site_schedules WHERE org_id = $1',
        [orgId],
      );
      await pool.query('DELETE FROM floorwalk.schedules WHERE org_id = $1', [
        orgId,
      ]);
      await pool.query(
        'DELETE FROM floorwalk.template_items WHERE template_id IN (SELECT id FROM floorwalk.templates WHERE org_id = $1)',
        [orgId],
      );
      await pool.query(
        'UPDATE floorwalk.users SET created_by = NULL WHERE org_id = $1',
        [orgId],
      );
      await pool.query('DELETE FROM floorwalk.users WHERE org_id = $1', [
        orgId,
      ]);
      await pool.query('DELETE FROM floorwalk.templates WHERE org_id = $1', [
        orgId,
      ]);
      await pool.query('DELETE FROM floorwalk.sites WHERE org_id = $1', [
        orgId,
      ]);
      await pool.query('DELETE FROM floorwalk.organizations WHERE id = $1', [
        orgId,
      ]);
      await pool.query('COMMIT');
    }
    await pool.end();
  }
});
