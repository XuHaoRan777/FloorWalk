import { randomUUID } from 'node:crypto';
import { expect, request as playwrightRequest, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  aiReviewResultSchema,
  type AiReviewInput,
} from '../../packages/shared/dist/index.js';
import { createPool } from '../../apps/api/src/db/client.js';
import { FakeAiReviewer } from '../../apps/api/src/ai/fake.js';
import { getStorageDriver } from '../../apps/api/src/storage/index.js';

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

test('g03 cross-line tenant onboarding, first login, photo storage, fake review and isolation', async ({
  request,
}) => {
  const unique = randomUUID();
  const orgName = `FW023-${unique}`;
  const adminEmail = `fw023-admin-${unique}@example.test`;
  const supervisorEmail = `fw023-supervisor-${unique}@example.test`;
  const inspectorEmail = `fw023-inspector-${unique}@example.test`;
  const siteCode = `FW-${unique.slice(0, 8)}`;
  const pool = createPool();
  const storage = await getStorageDriver();
  const storedKeys: string[] = [];
  let orgId: string | undefined;
  let inspectionId: string | undefined;

  try {
    const registration = await expectOk(
      await request.post('/api/orgs', {
        data: {
          orgName,
          adminName: 'FW-023 管理员',
          email: adminEmail,
          password,
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
        items: [
          { title: '门店照片', photoRequired: true, critical: false },
          { title: '地面整洁', photoRequired: false, critical: false },
        ],
      },
    });
    const template = await expectOk(templateResponse);
    expect(
      await expectOk(
        await request.post(`/api/admin/templates/${template.id}/current`),
      ),
    ).toMatchObject({ isCurrent: true });

    const supervisor = await expectOk(
      await request.post('/api/admin/users', {
        data: {
          email: supervisorEmail,
          displayName: 'FW-023 主管',
          role: 'supervisor',
          password,
        },
      }),
    );
    await expectOk(
      await request.put(`/api/admin/sites/${site.id}/supervisor`, {
        data: { userId: supervisor.id },
      }),
    );
    const inspector = await expectOk(
      await request.post('/api/admin/users', {
        data: {
          email: inspectorEmail,
          displayName: 'FW-023 店员',
          role: 'inspector',
          siteId: site.id,
          password,
        },
      }),
    );

    const staffContext = await playwrightRequest.newContext({
      baseURL: test.info().project.use.baseURL as string,
    });
    try {
      await expectOk(
        await staffContext.post('/api/auth/session', {
          data: { email: inspectorEmail, password },
        }),
      );
      await expectOk(
        await staffContext.post('/api/me/password', {
          data: { currentPassword: password, newPassword: changedPassword },
        }),
      );
      const today = await expectOk(
        await staffContext.get('/api/inspector/today'),
      );
      const inspection = await expectOk(
        await staffContext.post('/api/inspections', {
          data: { templateId: today.template.id },
        }),
      );
      inspectionId = inspection.id;
      const detail = await expectOk(
        await staffContext.get(`/api/inspections/${inspection.id}`),
      );
      const photoItem = detail.items.find(
        (item: { photoRequired: boolean }) => item.photoRequired,
      );
      expect(photoItem).toBeTruthy();
      await expectOk(
        await staffContext.patch(
          `/api/inspections/${inspection.id}/items/${photoItem.id}`,
          { data: { result: 'pass' } },
        ),
      );
      for (const item of detail.items) {
        if (item.id !== photoItem.id)
          await expectOk(
            await staffContext.patch(
              `/api/inspections/${inspection.id}/items/${item.id}`,
              { data: { result: 'pass' } },
            ),
          );
      }
      const upload = await expectOk(
        await staffContext.post(
          `/api/inspections/${inspection.id}/items/${photoItem.id}/evidence`,
          {
            multipart: {
              file: {
                name: 'evidence.jpg',
                mimeType: 'image/jpeg',
                buffer: jpeg,
              },
            },
          },
        ),
      );
      storedKeys.push(upload.storageKey);
      expect(upload.storageKey).toMatch(new RegExp(`^org/${orgId}/`));
      const submitted = await expectOk(
        await staffContext.post(`/api/inspections/${inspection.id}/submit`),
      );
      expect(submitted.status).toBe('submitted');

      const aiInput: AiReviewInput = {
        reviewPrompt: '检查提交的门店巡检和现场照片。',
        templateName: template.name,
        items: detail.items.map(
          (item: {
            id: string;
            title: string;
            photoRequired: boolean;
            critical: boolean;
            result: 'pass' | 'fail' | 'pending';
          }) => ({
            itemId: item.id,
            title: item.title,
            photoRequired: item.photoRequired,
            critical: item.critical,
            minPhotos: item.photoRequired ? 1 : 0,
            acceptanceCriteria: '现场照片清晰且内容符合检查项。',
            selfResult: item.result === 'fail' ? 'fail' : 'pass',
            photos:
              item.id === photoItem.id
                ? [{ kind: 'base64' as const, base64: jpeg.toString('base64') }]
                : [],
          }),
        ),
      };
      const aiResult = aiReviewResultSchema.parse(
        await new FakeAiReviewer().review(aiInput),
      );
      expect(aiResult).toMatchObject({ verdict: 'pass' });

      const northbeanContext = await playwrightRequest.newContext({
        baseURL: test.info().project.use.baseURL as string,
      });
      try {
        await expectOk(
          await northbeanContext.post('/api/auth/session', {
            data: { email: 'hq@northbean.example', password: 'northbean-demo' },
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
            await northbeanContext.get(`/api/inspections/${inspection.id}`)
          ).status(),
        ).toBe(404);
      } finally {
        await northbeanContext.dispose();
      }
    } finally {
      await staffContext.dispose();
    }
    expect(inspector.mustChangePassword).toBe(true);
  } finally {
    for (const key of storedKeys)
      await storage.delete(key).catch(() => undefined);
    if (orgId) {
      await pool.query(
        `DELETE FROM floorwalk.reviews r USING floorwalk.inspections i, floorwalk.sites s
         WHERE r.inspection_id = i.id AND i.site_id = s.id AND s.org_id = $1`,
        [orgId],
      );
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
        'DELETE FROM floorwalk.site_supervisors WHERE site_id IN (SELECT id FROM floorwalk.sites WHERE org_id = $1)',
        [orgId],
      );
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
    }
    await pool.end();
  }
});
