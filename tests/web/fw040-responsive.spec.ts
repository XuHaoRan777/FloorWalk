import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const evidenceDirectory = process.env.FW040_EVIDENCE_DIR
  ? path.resolve(process.env.FW040_EVIDENCE_DIR)
  : path.resolve('tests/web-results/fw040-responsive');
const widths = (process.env.FW040_WIDTHS ?? '768,1440').split(',').map(Number);
const baselineDirectory = process.env.FW041_EVIDENCE_DIR
  ? path.resolve(process.env.FW041_EVIDENCE_DIR)
  : null;

type Observation = {
  screen: string;
  width: number;
  documentOverflow: number;
  firstColumnSticky?: boolean;
  tables: Array<{
    label: string;
    tableWidth: number;
    scrollContainerWidth: number | null;
    scrollContainerScrollWidth: number | null;
    scrollContainerClass: string | null;
    horizontalScroll: number;
  }>;
};

async function loginAsAdmin(page: Page) {
  await page.goto('/');
  await page.getByLabel('登录名').fill('hq@northbean.example');
  await page.getByLabel('密码').fill('northbean-demo');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '总部看板' })).toBeVisible();
}

async function openSection(page: Page, label: string) {
  await page
    .getByLabel('控制台导航')
    .getByRole('button', { name: label, exact: true })
    .click();
  await expect(page.locator('.fw-page-heading h1').first()).toBeVisible();
}

async function inspectScreen(
  page: Page,
  screen: string,
  observations: Observation[],
) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    if (await page.locator('.fw-console').count()) {
      await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(
        width < 1024 ? 0 : 1,
      );
    }
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
    });

    const observation = await page.evaluate(
      ({ screen, width }) => {
        const tables = Array.from(document.querySelectorAll('table')).map(
          (table, index) => {
            let container: HTMLElement | null = table.parentElement;
            while (container) {
              const overflowX = getComputedStyle(container).overflowX;
              if (overflowX === 'auto' || overflowX === 'scroll') break;
              container = container.parentElement;
            }
            const section = table.closest('section[aria-label]');
            const caption = table.querySelector('caption')?.textContent?.trim();
            const tableWidth = table.getBoundingClientRect().width;
            const scrollContainerWidth = container?.clientWidth ?? null;
            const scrollContainerScrollWidth = container?.scrollWidth ?? null;
            return {
              label:
                caption ||
                section?.getAttribute('aria-label') ||
                `${screen} table ${index + 1}`,
              tableWidth,
              scrollContainerWidth,
              scrollContainerScrollWidth,
              scrollContainerClass: container?.className ?? null,
              horizontalScroll: container
                ? Math.max(0, container.scrollWidth - container.clientWidth)
                : 0,
            };
          },
        );
        return {
          screen,
          width,
          documentOverflow: Math.max(
            0,
            document.documentElement.scrollWidth - window.innerWidth,
          ),
          tables,
        };
      },
      { screen, width },
    );
    observations.push(observation);
    if (screen === 'dashboard-sites' && width === 1440) {
      const rows = page
        .getByRole('region', { name: '门店统计' })
        .locator('tbody tr');
      await expect(rows).toHaveCount(12);
      const lastRow = await rows.last().boundingBox();
      expect(lastRow, '第 12 家门店应有可见位置').not.toBeNull();
      expect(
        lastRow!.y + lastRow!.height,
        '1440 × 900 首屏应完整显示 12 家门店',
      ).toBeLessThanOrEqual(900);
    }
    if (screen === 'templates') {
      const saveButton = page.getByRole('button', {
        name: '保存修改',
        exact: true,
      });
      await expect(saveButton).toBeVisible();
      const saveBounds = await saveButton.boundingBox();
      expect(saveBounds, '模板保存操作应有可见位置').not.toBeNull();
      expect(
        saveBounds!.y,
        `${width}px 首屏应显示保存操作`,
      ).toBeGreaterThanOrEqual(0);
      expect(saveBounds!.y + saveBounds!.height).toBeLessThanOrEqual(900);
    }
    if (screen === 'users') {
      const firstColumnSticky = await page.evaluate(() => {
        const table = document.querySelector('.fw-users-table');
        const container = table?.parentElement;
        const firstCell = table?.querySelector('tbody td:first-child');
        if (
          !(table instanceof HTMLTableElement) ||
          !(container instanceof HTMLElement) ||
          !(firstCell instanceof HTMLElement)
        )
          return false;

        const isSticky = getComputedStyle(firstCell).position === 'sticky';
        const maxScroll = container.scrollWidth - container.clientWidth;
        if (maxScroll > 0) {
          container.scrollLeft = Math.min(40, maxScroll);
          const expectedLeft =
            container.getBoundingClientRect().left + container.clientLeft;
          const actualLeft = firstCell.getBoundingClientRect().left;
          container.scrollLeft = 0;
          return isSticky && Math.abs(actualLeft - expectedLeft) <= 1;
        }
        return isSticky;
      });
      observation.firstColumnSticky = firstColumnSticky;
      expect(firstColumnSticky, `账号表 ${width}px 首列应固定`).toBe(true);
    }
    if (baselineDirectory && width === 1440) {
      await page.screenshot({
        path: path.join(baselineDirectory, `${screen}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    } else if (!baselineDirectory) {
      await page.screenshot({
        path: path.join(evidenceDirectory, `${screen}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      if (screen === 'dashboard-sites' || screen === 'templates') {
        await page.screenshot({
          path: path.join(evidenceDirectory, `${screen}-${width}-viewport.png`),
          fullPage: false,
          animations: 'disabled',
        });
      }
    }
  }
}

test('FW-040 AC-05/08 与 FW-041 AC-07 Web 页面宽度和改版前截图', async ({
  page,
}) => {
  await mkdir(evidenceDirectory, { recursive: true });
  if (baselineDirectory) await mkdir(baselineDirectory, { recursive: true });
  const observations: Observation[] = [];

  await page.goto('/');
  await expect(page.getByLabel('登录名')).toBeVisible();
  await inspectScreen(page, 'login', observations);

  await page.goto('/forgot-password');
  await expect(
    page.getByRole('heading', { name: '找回管理员密码' }),
  ).toBeVisible();
  await inspectScreen(page, 'forgot-password', observations);

  await page.goto('/change-password');
  await expect(page.getByRole('heading', { name: '修改密码' })).toBeVisible();
  await inspectScreen(page, 'change-password', observations);

  await page.goto('/register');
  await expect(page.locator('h1').first()).toBeVisible();
  await inspectScreen(page, 'register', observations);

  await page.goto('/_design-samples');
  await expect(page.getByRole('heading', { name: '审核队列' })).toBeVisible();
  await inspectScreen(page, 'design-samples', observations);

  await page.goto('/_fw041_not_found');
  await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible();
  await inspectScreen(page, 'not-found', observations);

  await loginAsAdmin(page);
  await expect(page.getByText('正在加载看板…')).toHaveCount(0);
  await inspectScreen(page, 'console-default', observations);

  await openSection(page, '审核队列');
  await expect(page.getByText('正在加载审核队列…')).toHaveCount(0);
  await inspectScreen(page, 'review-queue', observations);

  await openSection(page, '今日视图');
  await expect(page.getByText('正在加载今日视图…')).toHaveCount(0);
  await inspectScreen(page, 'today-view', observations);

  await openSection(page, '总部看板');
  await expect(page.getByRole('group', { name: '统计维度' })).toBeVisible();
  await page
    .getByRole('group', { name: '统计维度' })
    .getByRole('button', {
      name: '门店',
      exact: true,
    })
    .click();
  await inspectScreen(page, 'dashboard-sites', observations);
  await page
    .getByRole('group', { name: '统计维度' })
    .getByRole('button', {
      name: '店长排行榜',
      exact: true,
    })
    .click();
  await inspectScreen(page, 'dashboard-managers', observations);
  await page
    .getByRole('group', { name: '统计维度' })
    .getByRole('button', {
      name: '日期趋势',
      exact: true,
    })
    .click();
  await inspectScreen(page, 'dashboard-dates', observations);

  await openSection(page, '人员管理');
  await expect(page.getByRole('table')).toBeVisible();
  await inspectScreen(page, 'users', observations);

  await openSection(page, '门店');
  await expect(page.getByRole('table')).toBeVisible();
  await inspectScreen(page, 'sites', observations);

  await openSection(page, '模板');
  await expect(
    page.getByRole('heading', { name: '模板', exact: true }),
  ).toBeVisible();
  await inspectScreen(page, 'templates', observations);

  await openSection(page, 'AI 审核标准');
  await inspectScreen(page, 'ai-standards', observations);

  await openSection(page, '日程方案');
  await inspectScreen(page, 'schedules', observations);

  await openSection(page, '门店日程安排');
  await inspectScreen(page, 'site-schedules', observations);

  const accountMenu = page.locator('.fw-sidebar-user');
  await page.locator('.fw-sidebar-user > summary').click();
  await expect(accountMenu).toHaveJSProperty('open', true);
  await page.locator('#main .fw-page-heading').click();
  await expect(accountMenu).toHaveJSProperty('open', false);

  await openSection(page, '总部看板');
  const secondaryAction = page.getByRole('button', {
    name: '本月',
    exact: true,
  });
  await secondaryAction.hover();
  await expect(secondaryAction).toHaveCSS('color', 'rgb(54, 93, 232)');

  await page.locator('.fw-sidebar-user > summary').click();
  await page.keyboard.press('Escape');
  await expect(accountMenu).toHaveJSProperty('open', false);
  await expect(page.locator('.fw-sidebar-user > summary')).toBeFocused();

  await page.locator('.fw-sidebar-user > summary').click();
  await page.getByRole('button', { name: '账户设置', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '账户设置', exact: true }),
  ).toBeVisible();
  await inspectScreen(page, 'profile', observations);

  await page.getByRole('button', { name: /^通知/ }).click();
  await expect(
    page.getByRole('heading', { name: '通知', exact: true }),
  ).toBeVisible();
  await inspectScreen(page, 'notifications', observations);

  console.log(
    `FW-040/FW-041 responsive observations\n${JSON.stringify(observations, null, 2)}`,
  );
  expect(observations).toHaveLength(20 * widths.length);
  expect(
    observations.filter((observation) => observation.documentOverflow > 0),
  ).toEqual([]);
});

test('FW-040 AC-01/06 侧栏断点与抽屉键盘焦点', async ({ page }) => {
  await loginAsAdmin(page);
  const trigger = page.getByRole('button', { name: 'Toggle Sidebar' });

  for (const width of [768, 1023]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.locator('[data-slot="sidebar"][data-mobile="true"]'),
    ).toHaveCount(0);
    await trigger.focus();
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const closeButton = dialog.getByRole('button', {
      name: '关闭',
      exact: true,
    });
    await expect(closeButton).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(document.activeElement?.closest('[data-mobile="true"]')),
        ),
      )
      .toBe(true);

    await expect
      .poll(
        () =>
          closeButton.evaluate((button) => {
            const rect = button.getBoundingClientRect();
            const topmost = document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2,
            );
            return topmost === button || button.contains(topmost);
          }),
        { timeout: 1000 },
      )
      .toBe(true);
    await closeButton.click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }

  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(
    page.locator('[data-slot="sidebar"][data-mobile="true"]'),
  ).toHaveCount(0);
});

test('FW-040 AC-04 侧栏账户姓名在窄屏内截断显示', async ({ page }) => {
  await loginAsAdmin(page);
  const identity = page.locator('.fw-sidebar-user__identity');
  const displayName = await identity.locator('strong').textContent();
  await expect(page.locator('.fw-sidebar-user summary')).toHaveAttribute(
    'title',
    displayName ?? '',
  );

  for (const width of [768, 1023]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('[data-slot="sidebar-trigger"]').click();
    await expect(page.locator('.fw-sidebar-user')).toBeVisible();
    const layout = await identity.evaluate((element) => {
      const name = element.querySelector('strong') as HTMLElement;
      const original = name.textContent ?? '';
      name.textContent = `${original} · ${'Northbean管理员'.repeat(10)}`;
      const style = getComputedStyle(name);
      const result = {
        whiteSpace: style.whiteSpace,
        textOverflow: style.textOverflow,
        clientWidth: name.clientWidth,
        scrollWidth: name.scrollWidth,
        withinHeader:
          name.getBoundingClientRect().right <=
          element.getBoundingClientRect().right,
      };
      name.textContent = original;
      return result;
    });

    expect(layout.whiteSpace, `${width}px 用户名称`).toBe('nowrap');
    expect(layout.textOverflow, `${width}px 用户名称截断`).toBe('ellipsis');
    expect(layout.clientWidth, `${width}px 名称应发生截断`).toBeLessThan(
      layout.scrollWidth,
    );
    expect(layout.withinHeader, `${width}px 名称不得溢出用户组件`).toBe(true);
    await page
      .locator('[data-slot="sidebar"][data-mobile="true"]')
      .getByRole('button', { name: '关闭' })
      .click();
  }
});
