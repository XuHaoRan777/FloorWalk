# 门店与模板管理

> ID：`FW-013`
>
> 状态：`approved`

## 目标

并行组 g02 的并行单元（槽位 2，[`howto/parallel.md`](../../howto/parallel.md) 第 3 节）。
总部和主管在 Web 控制台的「门店」「模板」分区里：新建门店、改名、停用和重新启用；新建模板、编辑名称与检查项、设为当前模板。停用门店的店员在 Mobile 上看到"门店已停用"、不能新建巡检；看板标出已停用的门店。

## 非目标

- 不做用户与角色管理（Backlog 另列）、按门店分配模板、模板删除、多人同时编辑的冲突检测（后保存的覆盖）。
- 不改契约、`schema.ts`、迁移、任何 `package.json`，不加依赖；不改 `console.tsx` 的分区与挂载。界面需要的字段契约里没有，停下报告（parallel.md 第 5 节）。

## 验收标准

界面 e2e 连本槽位起的 API。断言对照同一时刻 API 的返回。

- AC-01（`用户要求`）：门店管理 API 落库：`POST /api/admin/sites` 写入新门店（启用）；`PATCH /api/admin/sites/:id` 改名、`active: false` 写入 `deactivated_at`、`active: true` 清空它。门店编码重复 409，不存在 404，请求体不合法 400。API 测试各一条。
- AC-02（`用户要求`）：模板管理 API 落库：`POST /api/admin/templates` 新建（不设为当前）；`PUT /api/admin/templates/:id` 在一个事务里改名并整体替换检查项（至少 1 项、`position` 从 1 连续，否则 400）；`POST /api/admin/templates/:id/current` 在一个事务里把它设为当前、原当前模板改为非当前。名称重复 409，不存在 404。改模板后，已有巡检单的检查项和分数不变（API 测试用一张已提交的单前后对比）；之后新建的单用新检查项。
- AC-03（`用户要求`）：权限：总部和主管能调全部管理接口；店员调任何管理接口都 403。API 测试逐条覆盖店员 403。
- AC-04（`用户要求`）：Web「门店」页列出全部门店（含已停用，标"已停用"），能新建（编码、名称）、改名、停用与重新启用；停用前弹确认。操作后列表显示 API 返回的状态。
- AC-05（`用户要求`）：Web「模板」页列出全部模板，标出当前模板；能新建模板、编辑名称和检查项（增、删、改标题、勾选必拍和严重项、上下移动顺序），保存时至少 1 项；能把任一模板设为当前。保存后显示 API 返回的内容。
- AC-06（`用户要求`）：停用效果：店员所在门店停用后，Mobile「今日待巡」显示"门店已停用"，不显示开始巡检按钮；已提交的单主管仍能审完；记录页和历史详情照常可看；Web 看板这家店标"已停用"并显示最近一次分数；重新启用后恢复。Mobile 部分在 Expo Web 上取证。
- AC-07（`用户要求`）：网络错误和接口错误（400、403、404、409）都显示可读的中文提示；401 回登录页。

## 验收方式

`B Agent 验收`

- API 测试放 `apps/api/src/admin.test.ts`，Web e2e 放 `tests/web/admin.spec.ts`，Mobile e2e 放 `tests/mobile/site-deactivated.spec.ts`，不改已有测试文件（预授权的定位修正除外）。
- 本单元不用模拟器。

## 涉及的当前事实

- 拟新增 `specs/admin.md`：门店与模板管理的权限和规则（当前模板、停用效果、改模板不影响已有单）。由集成单元 FW-015 归档时 Promote。
- [`specs/web-console.md`](../../specs/web-console.md)「总部看板」「没有的」：看板标已停用；有门店和模板管理页。由 FW-015 统一 Promote。
- [`specs/mobile-inspector.md`](../../specs/mobile-inspector.md)「登录与今日巡检」：门店停用时的提示。由 FW-015 统一 Promote。

## 依赖

- FW-011

## 批准记录

- 批准依据：用户 2026-10-29 四个单元一起批准（原话"四个单元一起批准。提交推送，告诉我补 env 和打 g02/start 的步骤，再给我三条并行启动语。"）；产品决定与默认见 FW-011 plan「决策与偏差」
- 批准时间：`2026-10-29`
- 特殊授权：并行组 g02，写入范围：`apps/api/src/admin.controller.ts`、`apps/api/src/admin.test.ts`、`apps/api/src/inspection.controller.ts`（只改 today 与建单的停用效果）、`apps/api/src/dashboard.controller.ts`、`apps/web/src/components/console/sites-page.tsx`、`apps/web/src/components/console/templates-page.tsx`、`apps/web/src/components/console/dashboard-view.tsx`、`apps/web/src/lib/api/admin.ts`、`apps/mobile/components/mobile/today-screen.tsx`、`tests/web/admin.spec.ts`、`tests/mobile/site-deactivated.spec.ts`，可在这些文件旁新建只被它们引用的文件；在本分支 `g02/FW-013` 本地提交，不推送；只用 `floorwalk` 角色连 `floorwalk_e2e_2`。预授权：FW-011 写的测试或演示链漏了步骤，可在本分支补，不算契约改动；原有的不稳定测试只许改定位、不许放宽断言，改动在证据里写明。
