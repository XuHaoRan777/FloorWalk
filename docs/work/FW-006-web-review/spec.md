# Web 主管审核与总部看板

> ID：`FW-006`
>
> 状态：`approved`

## 目标

并行组 g01 的并行单元（槽位 3，[`howto/parallel.md`](../../howto/parallel.md) 第 3 节）。
主管在 Web 上登录后处理审核队列：看检查项、照片和审核历史，然后开始审核、通过、打回（选择打回项）或判不合格。
总部在 Web 上登录后看各店分数的只读看板。店员登录 Web 时被提示改用手机端。

## 非目标

- 不做门店、模板、用户的管理页，不做聊天和 Web Demo 说明页，这些归第二组。
- 不改 API、契约、`apps/mobile`、任何 `package.json`，不加依赖。界面需要的字段契约里没有，就停下报告（parallel.md 第 5 节）。

## 验收标准

界面 e2e 用 Playwright 驱动 Web，连本槽位起的 API（开发期是骨架）。断言一律对照同一时刻 API 的返回，不写死分数或条数。

- AC-01（`用户要求`）：用邮箱和密码登录，错误密码时显示错误提示；登录后刷新页面仍保持登录，可以退出。主管进入审核队列，总部进入看板；店员登录后只看到"请使用手机端"的提示，不进入任何页面。
- AC-02（`用户要求`）：审核队列列出 `submitted`、`in_review` 状态的单，显示门店名、提交时间、分数、状态，内容与 `GET /api/review/queue` 一致。
- AC-03（`用户要求`）：审核详情显示每个检查项的结果、备注和照片（照片能显示），以及按时间排列的审核历史。主管打开 `submitted` 的单时，界面自动执行「开始审核」。
- AC-04（`用户要求`）：主管能通过、判不合格、打回；打回时必须至少选一个检查项，可以填意见。有严重项不合格时，通过按钮禁用并说明原因。操作后界面显示 API 返回的新状态。
- AC-05（`用户要求`）：总部看板列出 12 家店的最近分数和状态，内容与 `GET /api/dashboard/sites` 一致。总部能看审核队列和详情，但看不到审核按钮。
- AC-06（`用户要求`）：网络错误和接口错误（401、403、409、422）都显示可读的中文提示；401 时回到登录页。

## 验收方式

`B Agent 验收`

- 页面沿用 shadcn-admin 已有的布局和组件。
- e2e：新建 `playwright.web.config.ts`，测试放 `tests/web/`。用 `FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts` 运行；配置里按槽位起 API（端口 3130）和 Web（端口 3131），并把 API 地址传给 Web。这一单元不能加 `package.json` 脚本，所以不走 pnpm script；连接信息由配置自己加载 `apps/api/.env.development`，不打印。不跑 `pnpm e2e:slots`。

## 涉及的当前事实

- 拟新增 `specs/web-console.md`，记录主管端和总部端的行为，由集成单元 FW-007 归档时 Promote 生成。
- [`specs/workspace.md`](../../specs/workspace.md)「Web 页面壳」：`/console` 从演示页改为主管和总部的控制台。由 FW-007 统一 Promote。

## 依赖

- FW-003

## 批准记录

- 批准依据：用户 2026-10-24 批准并行组 g01 的范围与 5 项默认，原话"需要我确认的5项全安你建议的来。建议补充的也加上。"
- 批准时间：`2026-10-24`
- 特殊授权：并行组 g01，写入范围：`apps/web`（不含 `package.json`）、`tests/web/`、`playwright.web.config.ts`；在本分支 `g01/FW-006` 本地提交，不推送；只用 `floorwalk` 角色连 `floorwalk_e2e_3`。
