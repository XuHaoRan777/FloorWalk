# Web 控制台剩余页面布局整理 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：无
- 阻塞：无
- 下一步：无

Preflight：Node `v24.19.0`、pnpm `11.21.0`；API 3018、Web 3019 已由 `proc.mjs` 启动，使用登录演示管理员的本地浏览器会话。
Preflight：七页 1440px 修改前截图已保存；审核详情截图使用本地临时待审任务与一条聊天消息，取证后已清理任务、巡检、检查项和消息。

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | 今日视图布局与状态 | `done` | AC-01、AC-08、AC-09、AC-10；768、1024、1440 后截图及空任务态核验 |
| T02 | 审核队列布局与状态 | `done` | AC-02、AC-08、AC-09、AC-10；保存后截图并核验空、单条、多条任务和长理由 |
| T03 | 审核详情与聊天布局 | `done` | AC-03、AC-08、AC-09、AC-10；保存后截图并核验检查项、聊天消息数量及长文本 |
| T04 | 门店页布局与状态 | `done` | AC-04、AC-08、AC-09、AC-10；保存后截图并核验 12 店、窄屏表格滚动和页面宽度 |
| T05 | 账号页布局与状态 | `done` | AC-05、AC-08、AC-09、AC-10；保存后截图并核验账号表、窄屏首列和长名称 |
| T06 | 通知收件箱布局与状态 | `done` | AC-06、AC-08、AC-09、AC-10；保存后截图并核验空、单条、多条及长通知文本 |
| T07 | 我的页面布局与状态 | `done` | AC-07、AC-09、AC-10；保存后截图并核验当前单一资料、空可选字段和长文本 |
| T08 | 最终代码审查 | `done` | AC-08、AC-09、AC-10、AC-11、AC-12；运行全部机器门、最终审查并准备方式 A 交接 |

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | `passed` | Chromium 浏览器以演示管理员登录；修改前 1440px 截图；修改后在 768、1024、1440 核验 0、1、4 个任务、1 条长门店名任务并测量页面溢出 | `docs/work/FW-042-web-console-pages/evidence/before/today-view-1440.png`, `docs/work/FW-042-web-console-pages/evidence/after/` | 修改前七页均核对 `/console`、登录态、页面内容和非空截图。详情基线含 8 个检查项、1 条聊天消息。修改后 `today-view-empty-*`、`today-view-one-*`、`today-view-*` 与 `today-view-long-site-*` 覆盖 0、1、4、1 条长名称任务，三档页面级横向溢出均为 0；指标为 768/1024 双列、1440 三列。临时日程与任务已清理。 |
| T02 | `passed` | Chromium 浏览器检查 768、1024、1440；待人工任务数依次为 0、1、4，今日已判定列表另有 1 条；页面溢出测量为 0 | `docs/work/FW-042-web-console-pages/evidence/after/` | `review-queue-empty-*`、`review-queue-one-*` 和 `review-queue-*` 分别覆盖 0、1、4 条待人工任务。状态标签为文字加语义色；长理由可换行；三档无页面级横向滚动。 |
| T03 | `passed` | Chromium 浏览器检查 768、1024、1440；分别核验 0 项/0 消息、1 项/0 消息、8 项/1 消息及 8 项/3 消息 | `docs/work/FW-042-web-console-pages/evidence/after/` | `review-detail-empty-*`、`review-detail-empty-chat-*`、`review-detail-one-chat-*`、`review-detail-*` 覆盖上述组合。1440 检查项/聊天两列；768、1024 单列；三档无页面级横向滚动；审核权限和聊天只读状态未改变。 |
| T04 | `passed` | Chromium 浏览器检查 768、1024、1440 门店页面、12 家门店及超长名称并测量页面/表格宽度 | `docs/work/FW-042-web-console-pages/evidence/after/` | `sites-*` 与 `sites-long-name-*` 均无页面级溢出；12 家门店均可呈现；768 表格自身横向滚动 214px，1024、1440 为 0。 |
| T05 | `passed` | Chromium 浏览器检查 768、1024、1440 账号页面、14 个账号、24 字昵称和超长门店名并测量首列固定与状态标签 | `docs/work/FW-042-web-console-pages/evidence/after/` | `accounts-*`、`accounts-long-name-*` 和 `accounts-long-site-*` 均无页面级溢出；三档首列固定且状态标签单行；768、1024 表格自身可横向滚动。测试昵称已恢复。 |
| T06 | `passed` | Chromium 浏览器检查 768、1024、1440；Northbean 4 条、演示二号 0 条和临时 1 条长通知；删除临时通知后复核剩余数 | `docs/work/FW-042-web-console-pages/evidence/after/` | `notifications-empty-1440.png`、`notifications-one-long-*` 和 `notifications-*` 分别覆盖 0、1、4 条。长正文三档无页面级横向溢出；读/未读文字与语义色同时可见；临时通知已清理。 |
| T07 | `passed` | Chromium 浏览器检查 768、1024、1440；以资料页现有表单保存 27 字昵称并核验长门店名，再恢复原资料 | `docs/work/FW-042-web-console-pages/evidence/after/` | `profile-*`、`profile-long-name-*` 与店长账号的 `profile-long-site-*` 覆盖单一当前资料、空头像及长文本；三档页面级溢出均为 0，测试昵称和门店名已恢复。 |
| T08 | `passed` | `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build`、`FW_SLOT=1 pnpm --filter @apps/api test`、`FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts`；独立 Subagent 按 `docs/howto/final-review.md` 审查完整差异；`node scripts/dev/proc.mjs stop web --local`、`node scripts/dev/proc.mjs stop api --local`、`node scripts/dev/proc.mjs status`、检查 3018/3019/3020 | `apps/web/src/components/console/`, `docs/work/FW-042-web-console-pages/evidence/comparison-1440.png` | typecheck、lint、格式、构建通过；API 183 通过、5 跳过；Web e2e 38 通过、1 跳过。独立审查七域均不适用、无可操作 finding。构建有既有 bundle 体积提示。`proc status` 为空，3018/3019/3020 无监听。审查指出的 T01/T03 证据路径已校正。 |
| T08 | `passed` | 用户回复“没问题”确认方式 A 人工验收；独立最终代码审查完成 | `docs/work/FW-042-web-console-pages/evidence/comparison-1440.png`, `docs/work/FW-042-web-console-pages/evidence/after/` | 用户已确认七页交付，并明确授权提交和推送。规格与窄屏事实已 Promote，单元已归档。证据目录清理偏差见下表。 |

## 交接

- 和讨论时不一样的：详情按已确认方案在 1440 并排、1024/768 上下排列；状态文字加语义色。临时取证数据已清理。
- 需要你测的：无。用户已于 2026-11-20 回复“没问题”。

| 页面 | 检查宽度 | 数据情况 |
| --- | --- | --- |
| 今日视图 | 768、1024、1440 | 0、1、4 条任务；门店和模板长文本；空警告与有待处理任务 |
| 审核队列 | 768、1024、1440 | 0、1、4 条待人工任务；0、1 条今日已判定任务；长审核理由和状态标签 |
| 审核详情（含聊天） | 768、1024、1440 | 0 项/0 消息、1 项/0 消息、8 项/1 消息、8 项/3 消息；长审核理由和聊天正文 |
| 门店 | 768、1024、1440 | 0、1、12 家门店；长门店名和多个店长名；仅门店表可横向滚动 |
| 账号 | 768、1024、1440 | 0、1、14 个账号；长昵称和登录名；仅账号表可横向滚动且首列固定 |
| 通知收件箱 | 768、1024、1440 | 0、1、4 条通知；长打回理由；已读和未读状态文字 |
| 我的 | 768、1024、1440 | 单一用户资料、空头像、27 字昵称、长登录名和只读资料 |

1440 前后对照总览：`docs/work/FW-042-web-console-pages/evidence/comparison-1440.png`。逐页文件在本单元 `evidence/before/` 与 `evidence/after/`。

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

| 日期 | 决策或偏差 |
| --- | --- |
| 2026-11-20 | 用户确认审核详情在 1440 下并排呈现检查项与只读聊天，1024、768 下上下排列；“我的”按当前单一用户资料模型验收。 |
| 2026-11-20 | 今日视图孤立测试任务被每日任务调度器移除；改用现有日程 API 创建并分配临时日程生成截图数据，随后解绑并删除日程，确认临时任务已清理。 |
| 2026-11-20 | 本单元 `evidence/` 的递归删除两次被执行策略以 `blocked by policy` 拒绝，作为归档清理偏差保留在本地。目录已被 Git 忽略。 |
