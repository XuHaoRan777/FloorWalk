# Web 品牌与点缀 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`in_progress`
- 归档状态：`active`
- 当前任务：无（等待方式 A 人工验收）
- 阻塞：等待用户目视确认交付
- 下一步：用户确认后 Promote 并归档

Preflight：只涉及 `apps/web` 和文档，不涉及数据库、API、凭据或外部服务。`apps/web` 有 typecheck 和 build 命令，没有包内测试或 lint 命令；lint 走根脚本，浏览器测试位于 `tests/web`。本机 Web 服务 `127.0.0.1:3019` 已登记且正在监听，复用它作预览，不重启。最终 Web e2e 前检查槽位 3 的 API/Web 端口并使用项目 Playwright 配置。

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | L1 Logo、favicon 与 AuthFrame 主视觉 | `done` | AC-01、AC-02、AC-03 |
| T02 | 三张 E1 插画及七处空态复用 | `done` | AC-04 |
| T03 | 审核详情 R2 常驻分数与一次性播放 | `done` | AC-05、AC-06、AC-08 |
| T04 | 同步 Web 事实与设计基线 | `done` | AC-07 |
| T05 | 最终代码审查（新上下文） | `done` | 全部 AC；审查前运行单元结束机器门 |

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | `passed` | `pnpm --filter @apps/web typecheck`; `pnpm lint`; `$env:FW_SLOT='3'; pnpm exec playwright test --config=playwright.web.config.ts --grep='注册入口与首次改密表单路由'` | `apps/web/src/components/brand-mark.tsx`; `apps/web/src/components/layout/auth-hero.tsx`; `apps/web/src/components/layout/auth-frame.tsx`; `apps/web/index.html`; `apps/web/src/main.tsx`; `apps/web/src/pages/console.tsx`; `apps/web/src/styles/console.css` | 类型与 lint 通过；注册、登录入口和首次改密路由 1/1 通过；浏览器检查 1440px 桌面、390/768/1024px 无横向溢出；第一轮 L1 样本测得 96/32/16px，favicon 控件生成 34px SVG 样本；H5 路线一次描画、五个勾停在终态；`prefers-reduced-motion` 样式移除运动。 |
| T02 | `passed` | `pnpm --filter @apps/web typecheck`; `pnpm lint`; `pnpm exec prettier --check apps/web/src/components/console/empty-illustration.tsx ... apps/web/src/styles/console.css` | `apps/web/src/components/console/empty-illustration.tsx`; `apps/web/src/components/console/today-view.tsx`; `apps/web/src/components/console/dashboard-view.tsx`; `apps/web/src/components/console/sites-page.tsx`; `apps/web/src/components/console/templates-page.tsx`; `apps/web/src/components/console/ai-standards-page.tsx`; `apps/web/src/components/console/schedules-page.tsx`; `apps/web/src/components/console/queue-view.tsx`; `apps/web/src/styles/console.css` | 类型、lint、格式通过；三张 SVG 均按 160×120 网格绘制，今日任务插画复用于今日视图与总部看板，模板插画复用于四个配置空态，通知插画用于队列总览；文案和原有图标保留。 |
| T03 | `passed` | `pnpm --filter @apps/web typecheck`; `pnpm lint`; `$env:FW_SLOT='3'; pnpm exec playwright test --config=playwright.web.config.ts tests/web/task-review.spec.ts --grep='FW-031'` | `apps/web/src/components/console/review-score-ring.tsx`; `apps/web/src/components/console/review-detail.tsx`; `apps/web/src/styles/console.css`; `tests/web/task-review.spec.ts` | 类型、lint 和 FW-031 审核与改判流程通过；验证常驻分数、首次整单判定播放、刷新静态展示、播放中改判切换、圆心双行分数、圆头弧段、徽标白描边和通过光圈；测试夹具在 `finally` 清理任务和文件。 |
| T04 | `passed` | `python scripts/validate_docs.py`; `pnpm --filter @apps/web typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm --filter @apps/web build`; `git diff --check` | `docs/specs/web-console.md`; `docs/context/design.md`; `docs/backlog.md`; `apps/web/dist/` | 文档校验 0 个问题；类型、lint、格式、Web 构建和 diff 检查通过；构建输出一个超过 500 kB 的 chunk 警告。Backlog 更新为 `in_progress` 并指向最终审查。 |
| T05 | `passed` | `独立 Subagent 按 docs/howto/final-review.md 对完整差异作只读审查` | `docs/howto/final-review.md`; `docs/work/FW-044-web-brand-accents/spec.md`; `docs/work/FW-044-web-brand-accents/plan.md` | 新上下文审查，七个失败域无 finding；指出 AC-04 空态实际页面和 12 项以上弧段合并仍需方式 A 人工目视验收。 |

## 交接

- 和讨论时不一样的：H5 主视觉按验收反馈以两倍速度播放，总时长约 1.34 秒。
- 需要你测的：在本地 Web `http://127.0.0.1:3019` 目视检查侧栏与 favicon 的 L1、四个认证页 H5 主视觉及一次性动效、七处指定空态插画和审核详情 R2 终态；特别确认 12 条以上时段间无缝且同色弧连续。已有的机器验证覆盖首判播放、已判定任务静态展示及播放期间改判取消播放。 |

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |
| 2026-11-21 | 登录页左侧那个样式的动画需要加速一倍 | H5 路线描画、检查点和巡检单勾选的时长及延迟均减半，末个检查点约在 1.34 秒完成。Web 类型检查和原 T01 认证路由用例通过。 | `FW-044: double auth hero animation speed` |
| 2026-11-21 | 巡检详情内状态圆环效果极差，你怎么做的？ | 参照 R2 样例将圆心分数改为上下两行，弧段改为圆头，补齐闭合徽标白描边和未完成条目后的徽标位置；通过态动画改为等待外扩光圈完成后收尾。更新审核用例覆盖这些表现。 | `FW-044: refine review score ring` |

## 决策与偏差

- 2026-11-21：用户确认三张 E1 插画复用映射、R2 改判播放规则和 `A 人工验收`；账号空态不配插画。
- 浏览器安全策略拒绝直接打开样例 `file://` 页面，改用登记的本地 Vite `@fs` 路径打开 round2 与第一轮 Logo 样例；已观察 H5 路线和 R2 弧段一次性播放及静态终态，几何参数写入本单规格。
- 改造前目录含 21 张 PNG，均已查看并保留；上一轮回复误报为 20 张。
