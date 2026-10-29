# 并行组 g02 集成

> ID：`FW-015`
>
> 状态：`approved`

## 目标

并行组 g02 的集成单元（[`howto/parallel.md`](../../howto/parallel.md) 第 6 节）。
把 FW-012、FW-013、FW-014 合进 master，跑全量门禁、演示链和各端界面 e2e，在模拟器上做一次原生回归，然后按顺序归档三个并行单元和本单元，并在试行记录写 g02 的数和"值不值"的判定。

## 非目标

- 不替并行单元补证据，也不实现它们漏掉的功能。查出的问题按 parallel.md 第 7 节归属。
- 不改契约。集成时发现契约要改，停下报告。

## 验收标准

- AC-01（`用户要求`）：按单元号顺序合并三个分支。每次合并前按 parallel.md 第 6 节 T01 核对契约、`schema.ts`、迁移、`package.json`、锁文件有没有未经批准的改动，有就停下报告；冲突的解法写进本单元 plan，冲突文件数记进试行记录。
- AC-02（`用户要求`）：合并后的 master 上，类型检查、lint、格式检查、构建、`FW_SLOT=1 pnpm --filter @apps/api test`、`pnpm e2e:slots`、`FW_SLOT=1 pnpm e2e:cors` 都通过。
- AC-03（`用户要求`）：`FW_SLOT=1 pnpm e2e:demo` 全绿；Web e2e（`tests/web/` 全部）和 Mobile e2e（`tests/mobile/` 全部）在同一槽位上全绿。
- AC-04（`用户要求`）：跨端界面演示链 `e2e:demo-ui` 扩展：主管在 Web 打回后在聊天里写原因；店员在 Expo Web 巡检页 5 秒内看到，回一条带图消息，补拍提交；主管 5 秒内看到店员的消息并通过；店员在「记录」Tab 第一行看到这张单并能打开只读详情、看到聊天；总部在 Web 停用一家无未审单的门店，看板标"已停用"。每个角色用独立的 `browser.newContext()`。
- AC-05（`用户要求`）：原生回归在模拟器上：登录 → 巡检选图上传提交（88）→ 巡检页聊天发图，Web 看到 →「记录」Tab 打开只读详情 → 冷启动保持登录。logcat 无 JS 错误。
- AC-06（`用户要求`）：交付与归档：三个并行单元都是方式 B，没有人工项时直接按 FW-012、FW-013、FW-014 的顺序归档（[`howto/archive.md`](../../howto/archive.md)，对账范围按 parallel.md 第 6 节），最后归档本单元；归档时在试行记录追加 g02 的数，含「集成回修」和按类别的「人工触点」，并按「值不值」判定写一行结论。

## 验收方式

`B Agent 验收`

- 人工触点由 Claude 复核时按类别核对后写入试行记录；本单元先按自己记的填，备注写"待复核"。

## 涉及的当前事实

- 各并行单元 spec 列出的 `specs/` 小节（新增 `specs/chat.md`、`specs/admin.md`；`web-console.md`、`mobile-inspector.md` 的相关小节），归档时统一 Promote。
- [`specs/workspace.md`](../../specs/workspace.md)「修订记录」：加 g02 一行。

## 依赖

- FW-012
- FW-013
- FW-014

## 批准记录

- 批准依据：用户 2026-10-29 四个单元一起批准（原话"四个单元一起批准。提交推送，告诉我补 env 和打 g02/start 的步骤，再给我三条并行启动语。"）；产品决定与默认见 FW-011 plan「决策与偏差」
- 批准时间：`2026-10-29`
- 特殊授权：在主目录的 master 上合并、提交，不推送；写入范围：合并冲突涉及的文件、`tests/demo/`、`playwright.demo.config.ts`、docs；第 7 节记在本单元的修复按修正模式的速度做；只用 `floorwalk` 角色连 `floorwalk_e2e_1`～`3`。
