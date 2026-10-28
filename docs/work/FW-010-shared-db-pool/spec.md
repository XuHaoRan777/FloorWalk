# API 共用数据库连接池

> ID：`FW-010`
>
> 状态：`approved`

## 目标

API 进程里所有请求共用一个 PostgreSQL 连接池，不再每个请求新建、关闭连接池（现在每个受保护请求至少开关两次：`AuthGuard` 一次、控制器一次）。g02 的聊天要每 2 秒轮询一次，不先修，延迟和连接数都会被放大。
接口的请求、响应和权限不变。本单元同时记第三个串行基线，按 [试行记录](../../parallel-trial.md)「值不值」的口径分类记人工触点。

## 非目标

- 不改任何接口的请求、响应、状态码和权限；不改契约、`schema.ts`、迁移。
- 迁移、种子、测试和脚本（`db/migrate.ts`、`db/seed.ts`、测试文件、`scripts/`、`tests/`）照旧自己建池、自己关，不改。
- 连接池大小不做成配置项，用 `pg` 默认值（`max` 10）；不加 `PG_POOL_MAX` 之类的环境变量。
- 不做查询层重构（不引入 repository、不改 SQL）。

## 验收标准

- AC-01（`用户要求`）：API 用一个 Nest provider 提供连接池，应用启动时建一次；应用关闭时（`app.close()`、收到退出信号）调 `pool.end()`。每个 Nest 应用实例各有自己的池，测试里多次 `createNestApplication` 互不共用。
- AC-02（`用户要求`）：`AuthGuard`、`OriginGuard`（如读库）和全部控制器改为注入这个池；`apps/api/src` 下除 `db/` 和测试文件外，不再出现 `createPool(` 和 `pool.end(`。用 `grep` 在证据里核对。
- AC-03（`用户要求`）：行为不变：用 `scripts/api-snapshot.mjs` 在同一槽位拆前、拆后各跑一次，两份逐字节相同；API 测试、契约 e2e、Web e2e、`e2e:mobile`、`e2e:cors`、`e2e:demo`、`e2e:demo-ui` 全绿，断言不改；全量门禁通过。
- AC-04（`建议采纳`）：新增一条 API 测试：用会话 cookie 同时发 50 个受保护请求（`GET /api/me` 与一个巡检详情各 25 个），全部成功；请求期间从 `pg_stat_activity` 按本槽位库名与应用名统计本进程的连接数，峰值不超过 10。改动前同一测试的连接峰值写进证据备注作对照。为区分本进程的连接，池设 `application_name`（如 `floorwalk-api`）。
- AC-05（`用户要求`）：应用关闭后连接全部释放：测试在 `app.close()` 之后查 `pg_stat_activity`，本进程的连接数为 0。

## 验收方式

`B Agent 验收`

- 改 `apps/api/src/auth.ts`，是 `scripts/workflow.conf` 的 hardline，相关提交带一行「硬线：」。
- 不加依赖。

## 涉及的当前事实

- [`specs/workspace.md`](../../specs/workspace.md)「API 进程探针」：补一句"API 进程共用一个数据库连接池，应用关闭时释放"。

## 依赖

- FW-009

## 批准记录

- 批准依据：用户 2026-10-28 采纳建议 1、不采纳建议 2（原话"按你的方案写 spec 和 plan，建议里采纳 1，不采纳 2。"），核对补发的建议说明后批准（原话"对得上，批准 FW-010，提交推送后给我 Codex 启动语。"）
- 批准时间：`2026-10-28`
- 特殊授权：无。在主目录 master 上做，按任务本地提交，用户说推送再推送。
