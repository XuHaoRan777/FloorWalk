# Web 控制台剩余页面布局整理（二）- 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：全部完成；用户确认方式 A 验收通过
- 阻塞：无。机器门与独立审查已通过，登录键盘焦点审计定向复测通过。
- 下一步：无；已 Promote 并归档。

Preflight：目标模块为 `apps/web` 页面呈现；控制台页面复用管理员登录态，认证页使用未登录态。修改前 1440px 截图在 `evidence/before/`，强制改密截图由首次登录必须改密的真实账号会话进入。
Preflight：API 3018 与 Web 3019 由 `scripts/dev/proc.mjs` 在本单元启动；数据库测试仅使用 `floorwalk` 角色及 `floorwalk` / 槽位数据库。

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | AI 审核标准页布局 | `done` | AC-01、AC-06、AC-07、AC-08；三档截图和页面宽度检查 |
| T02 | 日程方案页布局 | `done` | AC-02、AC-06、AC-07、AC-08；三档截图、任务网格断点和页面宽度检查 |
| T03 | 门店日程安排页布局 | `done` | AC-03、AC-06、AC-07、AC-08；12 店三档截图、批量表单断点和页面宽度检查 |
| T04 | 登录注册类四页共用布局 | `done` | AC-04、AC-06、AC-07、AC-08；三档截图和真实强制改密会话检查 |
| T05 | 根级 404 页面布局 | `done` | AC-05、AC-06、AC-07、AC-08；独立外框三档截图和页面宽度检查 |
| T06 | 最终代码审查 | `done` | AC-01～AC-10；全部机器门、完整差异审查和方式 A 交接 |

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | `passed` | 管理员浏览器检查 768、1024、1440 页面宽度并保存成品截图 | `docs/work/FW-043-web-remaining-pages/evidence/after/ai-review-standards-768.png`, `docs/work/FW-043-web-remaining-pages/evidence/after/ai-review-standards-1024.png`, `docs/work/FW-043-web-remaining-pages/evidence/after/ai-review-standards-1440.png` | 以管理员态打开 AI 审核标准，页面无横向溢出。标准列表和提示词编辑顺序保留，名称与输入控件允许收缩换行。 |
| T02 | `passed` | 管理员浏览器检查 768、1024、1440 页面宽度、任务控件列数并保存成品截图 | `docs/work/FW-043-web-remaining-pages/evidence/after/schedule-plans-768.png`, `docs/work/FW-043-web-remaining-pages/evidence/after/schedule-plans-1024.png`, `docs/work/FW-043-web-remaining-pages/evidence/after/schedule-plans-1440.png` | 种子方案含七天及任务。768/1024 任务两列，1440 四列；三档无页面级横向溢出。 |
| T03 | `passed` | 管理员浏览器检查 768、1024、1440 页面宽度并保存成品截图 | `docs/work/FW-043-web-remaining-pages/evidence/after/site-schedules-768.png`, `docs/work/FW-043-web-remaining-pages/evidence/after/site-schedules-1024.png`, `docs/work/FW-043-web-remaining-pages/evidence/after/site-schedules-1440.png` | 12 家种子门店均显示。批量表单 768/1024 纵向排列、1440 并列；表格局部可横向滚动，页面无横向溢出。 |
| T04 | `passed` | 未登录浏览器检查登录、注册、找回密码三页，并用真实首次登录必须改密账号进入强制改密页；检查 768、1024、1440 页面宽度 | `docs/work/FW-043-web-remaining-pages/evidence/after/login-1440.png`, `docs/work/FW-043-web-remaining-pages/evidence/after/register-1440.png`, `docs/work/FW-043-web-remaining-pages/evidence/after/forgot-password-1440.png`, `docs/work/FW-043-web-remaining-pages/evidence/after/change-password-1440.png` | 四页共用单栏表单宽度；强制改密账号由管理员 UI 创建并在截图后删除，登录响应确认强制改密状态。登录页原有说明文案拆为两段以避免单字孤行。 |
| T05 | `passed` | 未登录浏览器以未知根级 URL 检查独立 404 外框，核对 768、1024、1440 页面宽度 | `docs/work/FW-043-web-remaining-pages/evidence/after/not-found-768.png`, `docs/work/FW-043-web-remaining-pages/evidence/after/not-found-1024.png`, `docs/work/FW-043-web-remaining-pages/evidence/after/not-found-1440.png` | 页面显示“页面不存在”和“返回首页”，三档页面宽度检查通过。 |
| T06 | `passed` | `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build` | `apps/web/src/` | 四项机器门通过；构建输出既有 Web bundle 超过 500 kB 的提示。 |
| T06 | `passed` | `FW_SLOT=1 pnpm --filter @apps/api test` | `apps/api/` | 29 个测试文件通过、1 个跳过；183 项通过、5 项跳过。 |
| T06 | `failed` | `FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts` | `tests/web/ui-foundation.spec.ts`, `tests/web-results/slot-3/ui-foundation-FW-041-AC-07-登录后五屏三宽截图/error-context.md` | 39 项中 37 通过、1 跳过、1 失败。失败为 FW-041 登录键盘焦点审计，检查登录名输入框的计算外轮廓时得到 `none`。 |
| T06 | `failed` | `FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts tests/web/ui-foundation.spec.ts --grep 'FW-041 AC-07 登录后五屏三宽截图'` | `apps/web/src/pages/home.tsx`, `tests/web-results/slot-3/ui-foundation-FW-041-AC-07-登录后五屏三宽截图/error-context.md` | 第一次尝试增加 `focus-visible:outline-*` 工具类后，聚焦复测仍以同一断言失败。 |
| T06 | `failed` | 同一 FW-041 AC-07 键盘审计定向复测 | `apps/web/src/pages/home.tsx`, `tests/web-results/slot-3/ui-foundation-FW-041-AC-07-登录后五屏三宽截图/error-context.md` | 第二次尝试增加 `focus-visible:outline-solid` 后仍报告同一断言失败；同一 AC 两轮修复后按工作协议停止。独立本地浏览器读取到可见外轮廓，但槽位 e2e 结果没有变化。 |
| T06 | `passed` | 用户授权后新增 `.fw-auth-login` 局部焦点作用域；`pnpm --filter @apps/web typecheck`；`$env:FW_SLOT='3'; pnpm exec playwright test --config=playwright.web.config.ts tests/web/ui-foundation.spec.ts --grep 'FW-041 AC-07 登录后五屏三宽截图'` | `apps/web/src/pages/home.tsx`, `apps/web/src/styles/console.css`, `tests/web-results/slot-3/ui-foundation-FW-041-AC-07-登录后五屏三宽截图/` | 第三次尝试通过。根因是新登录首页移除了 `.fw-login` 祖先，既有外轮廓选择器未覆盖首页登录表单。 |
| T06 | `passed` | `pnpm typecheck` | workspace packages | shared、API、Mobile、Web 类型检查通过。 |
| T06 | `passed` | `pnpm lint` | `apps/`, `packages/` | ESLint 通过。 |
| T06 | `passed` | `pnpm format:check` | `apps/`, `packages/` | Prettier 检查通过。 |
| T06 | `passed` | `pnpm build` | workspace packages | API、Mobile、Web 构建通过；Web 有既有 bundle 大于 500 kB 提示。 |
| T06 | `passed` | `$env:FW_SLOT='1'; pnpm --filter @apps/api test` | `apps/api/` | 29 个测试文件通过、1 个跳过；183 项通过、5 项跳过。 |
| T06 | `passed` | `$env:FW_SLOT='3'; pnpm exec playwright test --config=playwright.web.config.ts` | `tests/web/`, `tests/web-results/slot-3/` | 39 项中 38 通过、1 项跳过；包含修改后的 FW-041 焦点审计。 |
| T06 | `passed` | 独立 Subagent 按 `docs/howto/final-review.md` 审阅完整差异；针对登录焦点 finding 复核最新差异 | `apps/web/src/`, `docs/work/FW-043-web-remaining-pages/spec.md`, `docs/work/FW-043-web-remaining-pages/plan.md` | 独立审查未发现业务行为、API/schema、颜色字面量或公共组件改动。登录焦点 finding 已修复并复核通过。AC-01～03 数据量变化和 AC-04 认证状态可辨识列入人工交接。 |
| T06 | `passed` | 用户确认方式 A 验收 | `docs/work/FW-043-web-remaining-pages/evidence/before/`, `docs/work/FW-043-web-remaining-pages/evidence/after/` | 用户原话：“FW-043 验收通过，归档提交推送”。 |
| 回修 | `passed` | `$env:FW_SLOT='3'; pnpm exec playwright test --config=playwright.web.config.ts tests/web/console.spec.ts tests/web/orgs.spec.ts tests/web/protocol.spec.ts tests/web/ui-foundation.spec.ts`；`pnpm --filter @apps/web typecheck`；`pnpm --filter @apps/web lint`；`pnpm format:check` | `tests/web/`, `apps/web/src/`, `docs/work/FW-043-web-remaining-pages/evidence/after/` | 13 项通过、1 项跳过；相关检查通过。认证四页共用品牌栏、标题说明、表单面板和底栏；404 增加独立错误层次。以真实必须改密账号进入 `/change-password`，随后删除临时账号。登录、注册、找回、改密和 404 三档成品截图已重拍。 |

## 交接

- 和讨论时不一样的：登录首页焦点审计发现原样式作用域不覆盖新根节点；经用户授权，为登录首页增加使用现有 `--fw-ring` 的局部焦点样式，定向审计通过。其他布局按已确认表实现。
- 需要你测的：AI 审核标准、日程方案、门店日程安排在 768、1024、1440 下分别检查 0、1、很多条数据及超长文本；登录、注册、找回管理员密码、强制改密在 768、1024、1440 下检查校验错误、网络错误、提交中三态；根级 404 在三档宽度检查页面不存在与返回首页。各页 1440 修改前后截图见下方链接；表格自身横向滚动可接受。

1440 修改前后对照：`evidence/before/ai-review-standards.png` → `evidence/after/ai-review-standards-1440.png`；`evidence/before/schedule-plans.png` → `evidence/after/schedule-plans-1440.png`；`evidence/before/site-schedules.png` → `evidence/after/site-schedules-1440.png`；`evidence/before/login.png` → `evidence/after/login-1440.png`；`evidence/before/register.png` → `evidence/after/register-1440.png`；`evidence/before/forgot-password.png` → `evidence/after/forgot-password-1440.png`；`evidence/before/change-password.png` → `evidence/after/change-password-1440.png`；`evidence/before/not-found.png` → `evidence/after/not-found-1440.png`。

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |
| 2026-11-20 | “登录、注册、强制改密、找回管理员密码、404页面也太简陋”；侧栏“返回登录”点后没有返回登录 | 新增复用 FW-041 样式的认证页共用框架；给根级 404 增加独立错误内容层级；按用户决定移除侧栏无效入口，顶栏“退出登录”保留。 | 未提交 |

## 决策与偏差

| 日期 | 决策或偏差 |
| --- | --- |
| 2026-11-20 | 用户确认认证四页沿用现有单栏表单布局，根级 404 保留现有独立外框；其余页面布局表按原样确认。 |
| 2026-11-20 | 卡点：Web e2e 的登录键盘焦点审计在槽位测试中连续两轮未观察到登录名输入框的外轮廓，其他 37 项通过。 |
| 2026-11-20 | 用户授权在认证页局部样式中使用现有 `--fw-ring` 修复并复测。仅登录首页焦点规则补充 `.fw-auth-login` 作用域，定向 FW-041 e2e 已通过。 |
| 2026-11-20 | 独立审查发现 AC-01 至 AC-03 的 0、1、很多条数据量及 AC-04 的校验错误、网络错误、提交中三态尚无单独证据；列入方式 A 人工交接逐项确认。 |
| 2026-11-20 | 用户指出认证四页和根级 404 视觉过于简陋；决定侧栏无效“返回登录”项移除，保留顶栏退出登录操作。回修未改变认证流程。 |
