import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const evidenceDirectory = process.env.FW040_EVIDENCE_DIR
  ? path.resolve(process.env.FW040_EVIDENCE_DIR)
  : path.resolve('tests/web-results/fw040-responsive');
const widths = (process.env.FW040_WIDTHS ?? '768,1440').split(',').map(Number);

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
    await page.screenshot({
      path: path.join(evidenceDirectory, `${screen}-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
}

test('FW-040 AC-05/08 15 个 Web 页面状态响应式检查与截图', async ({ page }) => {
  await mkdir(evidenceDirectory, { recursive: true });
  const observations: Observation[] = [];

  await page.goto('/');
  await expect(page.getByLabel('登录名')).toBeVisible();
  await inspectScreen(page, 'login', observations);

  await page.goto('/register');
  await expect(page.locator('h1').first()).toBeVisible();
  await inspectScreen(page, 'register', observations);

  await loginAsAdmin(page);

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

  await openSection(page, '账号');
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

  await openSection(page, '我的');
  await inspectScreen(page, 'profile', observations);

  await page.getByRole('button', { name: /^通知/ }).click();
  await expect(
    page.getByRole('heading', { name: '通知', exact: true }),
  ).toBeVisible();
  await inspectScreen(page, 'notifications', observations);

  console.log(
    `FW-040 responsive observations\n${JSON.stringify(observations, null, 2)}`,
  );
  expect(observations).toHaveLength(15 * widths.length);
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

test('FW-040 AC-04 顶栏身份单行截断并保留完整名称', async ({ page }) => {
  await loginAsAdmin(page);
  const identity = page.locator('[data-slot="console-identity"]');
  const fullIdentity = (await identity.textContent())?.trim() ?? '';
  await expect(identity).toHaveAttribute('title', fullIdentity);

  for (const width of [768, 1023]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0);
    const layout = await identity.evaluate((element) => {
      const original = element.textContent ?? '';
      element.textContent = `${original} · ${'Northbean管理员'.repeat(10)}`;
      const style = getComputedStyle(element);
      const result = {
        whiteSpace: style.whiteSpace,
        textOverflow: style.textOverflow,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        withinHeader:
          element.getBoundingClientRect().right <=
          element.parentElement!.getBoundingClientRect().right,
      };
      element.textContent = original;
      return result;
    });

    expect(layout.whiteSpace, `${width}px 身份文本`).toBe('nowrap');
    expect(layout.textOverflow, `${width}px 身份截断`).toBe('ellipsis');
    expect(layout.clientWidth, `${width}px 应发生截断`).toBeLessThan(
      layout.scrollWidth,
    );
    expect(layout.withinHeader, `${width}px 身份不得溢出顶栏`).toBe(true);
  }
});
