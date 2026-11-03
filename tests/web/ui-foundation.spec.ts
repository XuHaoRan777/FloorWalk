import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';

const evidence = path.resolve('docs/work/FW-016-ui-foundation/evidence');

async function keyboardAudit(page: Page, screen: string) {
  await page.mouse.click(1, 1);
  const seen = new Set<string>();
  const results = [];
  for (let index = 0; index < 100; index += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      return {
        key: [...document.querySelectorAll('*')].indexOf(element),
        name:
          element.getAttribute('aria-label') ||
          element.textContent?.trim() ||
          element.id ||
          element.tagName,
        outline: style.outlineStyle,
        width: parseFloat(style.outlineWidth),
      };
    });
    if (!focused) continue;
    if (seen.has(String(focused.key))) break;
    seen.add(String(focused.key));
    expect(focused.outline, `${screen}: ${focused.name}`).not.toBe('none');
    expect(focused.width, `${screen}: ${focused.name}`).toBeGreaterThanOrEqual(
      2,
    );
    results.push(focused);
  }
  expect(results.length).toBeGreaterThan(0);
  await writeFile(
    path.join(evidence, `keyboard-${screen}.json`),
    JSON.stringify(results, null, 2),
  );
}

async function login(page: Page, role: 'supervisor' | 'hq') {
  await page.goto('/');
  await page.getByLabel('邮箱').fill(`${role}@northbean.example`);
  await page.getByLabel('密码').fill('northbean-demo');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

async function capture(page: Page, screen: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (screen === 'sites') {
      const bounds = await page.locator('.fw-site-form').evaluate((form) => {
        const box = form.getBoundingClientRect();
        return [...form.querySelectorAll('input,button')].map((control) => {
          const rect = control.getBoundingClientRect();
          return rect.left >= box.left - 1 && rect.right <= box.right + 1;
        });
      });
      expect(
        bounds.every(Boolean),
        `门店表单 ${width}px 控件必须位于工作区内`,
      ).toBe(true);
    }
    await page.screenshot({
      path: path.join(evidence, `web-${screen}-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `${screen} ${width}px 页面不得横向溢出`,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('FW-016 AC-05 登录后五屏三宽截图', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.goto('/');
  await expect(page.getByLabel('邮箱')).toBeVisible();
  await keyboardAudit(page, 'login');
  await login(page, 'supervisor');
  await expect(page.getByRole('heading', { name: '审核队列' })).toBeVisible();
  await expect(page.getByText('正在加载审核队列…')).toHaveCount(0);
  await capture(page, 'queue');
  await page
    .getByRole('button')
    .filter({ hasText: '查看并审核' })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: '审核决定' })).toBeVisible();
  await expect(page.getByText('正在处理审核…')).toHaveCount(0);
  await expect(page.getByText('正在加载聊天…')).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator('img')
        .evaluateAll((images) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
    )
    .toBe(true);
  await capture(page, 'review');
  await keyboardAudit(page, 'review');
  await page.getByRole('button', { name: '门店', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '门店', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('正在加载门店…')).toHaveCount(0);
  await capture(page, 'sites');
  await page.getByRole('button', { name: '模板', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '模板', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('正在加载模板…')).toHaveCount(0);
  await capture(page, 'templates');
  await page.getByRole('button', { name: '退出登录' }).click();
  await login(page, 'hq');
  await expect(page.getByRole('heading', { name: '总部看板' })).toBeVisible();
  await expect(page.getByText('正在加载门店数据…')).toHaveCount(0);
  await capture(page, 'dashboard');
  await writeFile(
    path.join(evidence, 'web-screens.json'),
    JSON.stringify(
      {
        screens: ['queue', 'review', 'sites', 'templates', 'dashboard'],
        widths: [1440, 768, 390],
        data: 'floorwalk_e2e 槽位内已有演示种子；审核详情会触发既有开始审核动作，下次槽位重置清理。',
      },
      null,
      2,
    ),
  );
});

test('FW-016 AC-05 公开页面 inspector', async ({ baseURL }) => {
  test.skip(process.env.FW_UI_INSPECT !== '1', '技能检查仅在本单元取证时运行');
  test.setTimeout(180_000);
  const inspector = path.join(
    homedir(),
    '.agents/skills/design-taste-frontend/scripts/inspect.mjs',
  );
  for (const [name, route] of [
    ['login', '/'],
    ['samples', '/_design-samples'],
  ]) {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        inspector,
        `${baseURL}${route}`,
        '--app',
        '--out',
        `.taste-skill/after/t06-${name}`,
      ],
      { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 },
    );
    console.log(stdout);
  }
});
