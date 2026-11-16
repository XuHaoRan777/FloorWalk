import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';

export const dashboardPassword = 'fw034-test-password';
const password = dashboardPassword;

export async function createDashboardFixture(page: Page, apiBase: string) {
  const slot = Number(process.env.FW_SLOT);
  if (!Number.isInteger(slot) || slot < 1 || slot > 3) {
    throw new Error('FW_SLOT 必须是 1、2 或 3。');
  }
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  if (decodeURIComponent(databaseUrl.username) !== 'floorwalk') {
    throw new Error('测试数据库必须使用 floorwalk 角色。');
  }
  databaseUrl.pathname = `/floorwalk_e2e_${slot}`;
  const pool = createPool(databaseUrl.toString());
  const email = `fw034-stats-${randomUUID()}@example.test`;
  const managerLogin = `manager-${email}`;
  let orgId: string | undefined;
  const cleanup = async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM floorwalk.inspection_items WHERE inspection_id IN
         (SELECT inspection.id FROM floorwalk.inspections inspection
          JOIN floorwalk.sites site ON site.id = inspection.site_id WHERE site.org_id = $1)`,
        [orgId],
      );
      await client.query(
        `DELETE FROM floorwalk.inspections WHERE site_id IN
         (SELECT id FROM floorwalk.sites WHERE org_id = $1)`,
        [orgId],
      );
      await client.query(
        'DELETE FROM floorwalk.inspection_tasks WHERE org_id = $1',
        [orgId],
      );
      await client.query('DELETE FROM floorwalk.users WHERE org_id = $1', [
        orgId,
      ]);
      await client.query('DELETE FROM floorwalk.templates WHERE org_id = $1', [
        orgId,
      ]);
      await client.query(
        'DELETE FROM floorwalk.ai_review_standards WHERE org_id = $1',
        [orgId],
      );
      await client.query('DELETE FROM floorwalk.sites WHERE org_id = $1', [
        orgId,
      ]);
      await client.query('DELETE FROM floorwalk.organizations WHERE id = $1', [
        orgId,
      ]);
      await client.query(
        'DELETE FROM floorwalk.email_verifications WHERE email = $1',
        [email],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  };
  try {
    expect(
      (
        await page.request.post(`${apiBase}/auth/registration-code`, {
          data: { email },
        })
      ).status(),
    ).toBe(201);
    const mailbox = await page.request.get(`${apiBase}/testing/mailbox`, {
      params: { recipient: email },
    });
    expect(mailbox.status()).toBe(200);
    const registration = await page.request.post(`${apiBase}/orgs`, {
      data: {
        orgName: 'FW-034 统计商家',
        adminName: '统计管理员',
        email,
        password,
        verificationCode: (await mailbox.json()).code,
      },
    });
    expect(registration.status()).toBe(201);
    orgId = (await registration.json()).org.id as string;
    const siteIds = [randomUUID(), randomUUID()];
    for (const [index, id] of siteIds.entries()) {
      await pool.query(
        'INSERT INTO floorwalk.sites (id, org_id, code, name) VALUES ($1, $2, $3, $4)',
        [id, orgId, `STAT-${index + 1}`, `统计门店${index + 1}`],
      );
    }
    const managerResponse = await page.request.post(`${apiBase}/admin/users`, {
      data: {
        loginName: managerLogin,
        displayName: '统计店长',
        role: 'store_manager',
        siteId: siteIds[0],
        password,
      },
    });
    expect(managerResponse.status()).toBe(201);
    const managerId = (await managerResponse.json()).id as string;
    const standardId = randomUUID();
    await pool.query(
      'INSERT INTO floorwalk.ai_review_standards (id, org_id, name, prompt) VALUES ($1, $2, $3, $4)',
      [standardId, orgId, '测试标准', '测试用标准'],
    );
    const templateIds = [randomUUID(), randomUUID()];
    for (const [index, id] of templateIds.entries()) {
      await pool.query(
        'INSERT INTO floorwalk.templates (id, org_id, name, ai_enabled, ai_standard_id) VALUES ($1, $2, $3, $4, $5)',
        [
          id,
          orgId,
          index === 0 ? '人工模板' : 'AI模板',
          index === 1,
          index === 1 ? standardId : null,
        ],
      );
    }
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    let position = 0;
    const addTask = async (
      input: {
        site?: number;
        ai?: boolean;
        date?: string;
        due?: Date;
        score?: number;
        critical?: boolean;
        results?: Array<'pass' | 'fail' | 'rework' | 'pending' | null>;
        job?: 'manual' | 'processing';
      } = {},
    ) => {
      const taskId = randomUUID();
      const inspectionId = randomUUID();
      const due = input.due ?? new Date(Date.now() + 60 * 60_000);
      const starts = new Date(due.getTime() - 2 * 60 * 60_000);
      const siteId = siteIds[input.site ?? 0];
      const templateId = templateIds[input.ai ? 1 : 0];
      await pool.query(
        `INSERT INTO floorwalk.inspection_tasks
         (id, org_id, site_id, template_id, task_date, position, starts_at, due_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          taskId,
          orgId,
          siteId,
          templateId,
          input.date ?? today,
          position++,
          starts,
          due,
          input.results ? 'in_progress' : 'not_started',
        ],
      );
      if (input.results) {
        await pool.query(
          `INSERT INTO floorwalk.inspections (id, task_id, site_id, template_id, inspector_id, status, score, decided_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            inspectionId,
            taskId,
            siteId,
            templateId,
            managerId,
            input.score === undefined
              ? 'draft'
              : input.critical
                ? 'failed'
                : 'passed',
            input.score ?? null,
            input.score === undefined ? null : new Date(),
          ],
        );
        for (const [index, result] of input.results.entries()) {
          const itemId = randomUUID();
          const uploadedAt =
            result === null
              ? null
              : new Date(Math.min(Date.now(), due.getTime() - 60_000));
          await pool.query(
            `INSERT INTO floorwalk.inspection_items
             (id, inspection_id, position, title, critical, result, self_assessment,
              first_self_assessment, first_result, first_uploaded_by_id, uploaded_by_id, uploaded_at, upload_version)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $9, $10, $11)`,
            [
              itemId,
              inspectionId,
              index + 1,
              `检查项${index + 1}`,
              input.critical ?? false,
              result ?? 'pending',
              result === null ? null : 'pass',
              result === null || result === 'pending' ? null : result,
              result === null ? null : managerId,
              uploadedAt,
              result === null ? 0 : 1,
            ],
          );
          if (input.job && uploadedAt) {
            await pool.query(
              `INSERT INTO floorwalk.ai_review_jobs (inspection_item_id, uploaded_at, upload_version, status, attempt_count, available_at)
               VALUES ($1, $2, 1, $3, 4, $4)`,
              [
                itemId,
                uploadedAt,
                input.job,
                new Date(Date.now() + 60 * 60_000),
              ],
            );
          }
        }
      }
      return { taskId, inspectionId };
    };
    const open = async () => {
      await page.goto('/admin');
      await expect(
        page.getByRole('heading', { name: '管理员主页', exact: true }),
      ).toBeVisible();
    };
    return {
      pool,
      orgId,
      email,
      siteIds,
      managerId,
      managerLogin,
      today,
      addTask,
      open,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
