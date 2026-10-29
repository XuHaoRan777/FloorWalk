# Mobile 记录页

> ID：`FW-014`
>
> 状态：`approved`

## 目标

并行组 g02 的并行单元（槽位 3，[`howto/parallel.md`](../../howto/parallel.md) 第 3 节）。
店员在 Mobile「记录」Tab 看到本店全部巡检单（任何状态），每次 10 条，底部"加载更多"；点进去看只读详情：检查项结果、备注、照片、审核历史和聊天。

## 非目标

- 不做搜索、筛选、按日期跳转；列表不显示巡检人（契约 `inspectorRecordSchema` 没有这个字段）。
- 详情一律只读：草稿和被打回的单也不能在这里编辑，编辑走「今日待巡」。
- 不实现聊天面板本身（FW-012 负责），只把它挂在详情页上（FW-011 已挂好）。
- 不改契约、`schema.ts`、迁移、任何 `package.json`，不加依赖；不改 Tabs 布局。界面需要的字段契约里没有，停下报告（parallel.md 第 5 节）。

## 验收标准

界面 e2e 用 Playwright 驱动 Expo Web，连本槽位起的 API。断言对照同一时刻 API 的返回，不写死条数。

- AC-01（`用户要求`）：`GET /api/inspector/inspections` 返回本店全部状态的单，按 `created_at` 倒序，每页 10 条，`nextCursor` 翻页不重复、不遗漏（含同一毫秒创建的单）；只能看本店的。API 测试覆盖：翻完所有页的 id 集合等于库里本店全部单；外店的单不出现；主管、总部 403；`limit` 超过 50 返回 400；伪造的 `cursor` 返回 400。
- AC-02（`用户要求`）：「记录」Tab 列表每行显示状态（中文）、分数（没有时显示"—"）、创建时间、提交时间；首屏 10 条，底部"加载更多"再取 10 条追加，没有更多时显示"没有更多了"；下拉刷新回到第一页。加载中、加载失败、空列表三种状态各有提示。
- AC-03（`用户要求`）：点一行进入只读详情（`records/[id]`），用 `GET /api/inspections/:id` 显示检查项的结果、备注、照片（能显示）、分数、状态和按时间排列的审核历史；没有任何编辑控件。聊天面板显示在详情底部。
- AC-04（`用户要求`）：同店另一位店员建的单也能在列表和详情里看到（种子里没有就在测试里造一个同店店员和一张单）。
- AC-05（`用户要求`）：网络错误和接口错误（400、403、404）都显示可读的中文提示；401 回登录页。

## 验收方式

`B Agent 验收`

- API 测试放 `apps/api/src/records.test.ts`，Mobile e2e 放 `tests/mobile/records.spec.ts`，不改已有测试文件（预授权的定位修正除外）。
- 本单元不用模拟器：记录页只读、不走原生上传，Expo Web 取证即可；原生回归由集成单元做。

## 涉及的当前事实

- [`specs/mobile-inspector.md`](../../specs/mobile-inspector.md)「没有的」：删掉"没有我的历史单记录页"，加「记录」小节。由集成单元 FW-015 归档时 Promote。

## 依赖

- FW-011

## 批准记录

- 批准依据：用户 2026-10-29 四个单元一起批准（原话"四个单元一起批准。提交推送，告诉我补 env 和打 g02/start 的步骤，再给我三条并行启动语。"）；产品决定与默认见 FW-011 plan「决策与偏差」
- 批准时间：`2026-10-29`
- 特殊授权：并行组 g02，写入范围：`apps/api/src/records.controller.ts`、`apps/api/src/records.test.ts`、`apps/mobile/app/(authenticated)/(tabs)/records.tsx`、`apps/mobile/app/(authenticated)/records/[id].tsx`（不改 `ChatPanel` 那一行）、`apps/mobile/components/mobile/records-screen.tsx`、`apps/mobile/lib/api/records.ts`、`tests/mobile/records.spec.ts`，可在这些文件旁新建只被它们引用的文件；在本分支 `g02/FW-014` 本地提交，不推送；只用 `floorwalk` 角色连 `floorwalk_e2e_3`。预授权：FW-011 写的测试或演示链漏了步骤，可在本分支补，不算契约改动；原有的不稳定测试只许改定位、不许放宽断言，改动在证据里写明。
