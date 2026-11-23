import { expect, test } from '@playwright/test';
import type { AiStandard, QuickSetupTemplateResponse } from '@libs/shared';
import type { AdminTemplate } from '../../apps/mobile/lib/api/admin';
import { cleanupTemplates, loginAdmin, saveAdmin } from './admin-fixtures';

test('AC-04、AC-05 模板检查项、AI 标准、三套快捷配置与引用删除拦截', async ({
  page,
}) => {
  const templateIds: string[] = [];
  const standardIds: string[] = [];
  try {
    await loginAdmin(page);
    await page.getByTestId('admin-entry-ai-standards').click();
    await page.getByRole('button', { name: '新建标准', exact: true }).click();
    await page.getByLabel('标准名称', { exact: true }).fill('移动审核标准');
    await page
      .getByLabel('提示词', { exact: true })
      .fill('依据照片和验收要点逐项审核。');
    const standard = await saveAdmin<AiStandard>(
      page,
      '/admin/ai-standards',
      'POST',
      '创建标准',
    );
    standardIds.push(standard.id);
    const standardCard = page.getByTestId(`standard-${standard.id}`);
    await standardCard
      .getByRole('button', { name: '编辑', exact: true })
      .click();
    await page.getByLabel('标准名称', { exact: true }).fill('移动审核标准修改');
    await page
      .getByLabel('提示词', { exact: true })
      .fill('仅依据照片中可见的信息审核，无法确认时说明原因。');
    const revised = await saveAdmin<AiStandard>(
      page,
      `/admin/ai-standards/${standard.id}`,
      'PUT',
      '保存标准',
    );
    expect(revised.name).toBe('移动审核标准修改');
    expect(revised.prompt).toContain('无法确认时说明原因');

    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByTestId('admin-entry-templates').click();
    await page.getByRole('button', { name: '新建模板', exact: true }).click();
    await page.getByLabel('模板名称', { exact: true }).fill('移动模板');
    await page
      .getByLabel('AI 审核标准', { exact: true })
      .selectOption(standard.id);
    await page.getByLabel('检查项 1 标题', { exact: true }).fill('清洁台面');
    await page.getByLabel('检查项 1 最少照片张数', { exact: true }).fill('2');
    await page
      .getByLabel('检查项 1 验收要点', { exact: true })
      .fill('台面清洁，物品分类摆放。');
    await page.getByText('检查项 1 严重项', { exact: true }).click();
    await page.getByRole('button', { name: '添加检查项', exact: true }).click();
    await page.getByLabel('检查项 2 标题', { exact: true }).fill('文字记录');
    await page
      .getByTestId('template-item-2')
      .getByRole('button', { name: '上移', exact: true })
      .click();
    await expect(page.getByLabel('检查项 1 标题', { exact: true })).toHaveValue(
      '文字记录',
    );
    const template = await saveAdmin<AdminTemplate>(
      page,
      '/admin/templates',
      'POST',
      '创建模板',
    );
    templateIds.push(template.id);
    expect(template.aiEnabled).toBe(true);
    expect(template.aiStandardId).toBe(standard.id);
    expect(template.items.map((item) => item.title)).toEqual([
      '文字记录',
      '清洁台面',
    ]);
    expect(template.items[1]).toMatchObject({
      minPhotoCount: 2,
      critical: true,
      acceptanceCriteria: '台面清洁，物品分类摆放。',
    });
    const templateCard = page.getByTestId(`template-${template.id}`);
    await templateCard.click();
    await page.getByLabel('模板名称', { exact: true }).fill('移动模板修改');
    await page
      .getByLabel('检查项 1 标题', { exact: true })
      .fill('已编辑文字记录');
    await page.getByText('启用 AI 审核', { exact: true }).click();
    await page.getByLabel('AI 审核标准', { exact: true }).selectOption('');
    await page.getByRole('button', { name: '添加检查项', exact: true }).click();
    await page
      .getByTestId('template-item-3')
      .getByRole('button', { name: '移除检查项', exact: true })
      .click();
    const updated = await saveAdmin<AdminTemplate>(
      page,
      `/admin/templates/${template.id}`,
      'PUT',
      '保存模板',
    );
    expect(updated.aiEnabled).toBe(false);
    expect(updated.aiStandardId).toBeNull();
    expect(updated.items).toHaveLength(2);
    expect(updated.items[0].title).toBe('已编辑文字记录');
    await page.reload();
    await templateCard.click();
    await expect(page.getByLabel('模板名称', { exact: true })).toHaveValue(
      '移动模板修改',
    );
    await expect(
      page.getByLabel('检查项 2 最少照片张数', { exact: true }),
    ).toHaveValue('2');
    await page.getByRole('button', { name: '取消', exact: true }).click();

    const quickResults: QuickSetupTemplateResponse[] = [];
    for (const label of ['咖啡店', '餐馆', '花店']) {
      const result = await saveAdmin<QuickSetupTemplateResponse>(
        page,
        '/admin/templates/quick-setup',
        'POST',
        label,
      );
      templateIds.push(result.template.id);
      standardIds.push(result.standard.id);
      quickResults.push(result);
      await expect(
        page.getByTestId(`template-${result.template.id}`),
      ).toContainText(result.template.name);
    }
    const quick = quickResults[0];
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByTestId('admin-entry-ai-standards').click();
    const referenced = page.getByTestId(`standard-${quick.standard.id}`);
    await referenced.getByRole('button', { name: '删除', exact: true }).click();
    const blocked = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/admin/ai-standards/${quick.standard.id}`) &&
        response.request().method() === 'DELETE',
    );
    await referenced
      .getByRole('button', { name: '确认删除', exact: true })
      .click();
    expect((await blocked).status()).toBe(409);
    await expect(
      page.getByText('该审核标准仍被模板引用，不能删除。', { exact: true }),
    ).toBeVisible();
    await expect(referenced).toContainText(quick.standard.name);
    await standardCard
      .getByRole('button', { name: '删除', exact: true })
      .click();
    const deleted = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/admin/ai-standards/${standard.id}`) &&
        response.request().method() === 'DELETE',
    );
    await standardCard
      .getByRole('button', { name: '确认删除', exact: true })
      .click();
    expect((await deleted).status()).toBe(204);
    await expect(standardCard).toHaveCount(0);
  } finally {
    await cleanupTemplates(templateIds, standardIds);
  }
});
