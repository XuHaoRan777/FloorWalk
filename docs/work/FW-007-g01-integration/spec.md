# 并行组 g01 集成

> ID：`FW-007`
>
> 状态：`approved`

## 目标

并行组 g01 的集成单元（[`howto/parallel.md`](../../howto/parallel.md) 第 6 节）。
把 FW-004、FW-005、FW-006 合进 master，跑全量门禁和演示链，然后按顺序归档三个并行单元和本单元。
做完后，Northbean 的 8 分钟演示能在三端界面上从头走到尾。

## 非目标

- 不替并行单元补证据，也不实现它们漏掉的功能。查出的问题按 parallel.md 第 7 节归属。
- 不改契约。集成时发现契约要改，停下报告。

## 验收标准

- AC-01（`用户要求`）：按单元号顺序合并三个分支。每次合并前按 parallel.md 第 6 节 T01 核对契约、schema、迁移、`package.json`、锁文件有没有未经批准的改动，有就停下报告；冲突的解法写进本单元 plan。
- AC-02（`用户要求`）：合并后的 master 上，类型检查、lint、格式检查、构建、`FW_SLOT=1 pnpm --filter @apps/api test`、`pnpm e2e:slots`、`FW_SLOT=1 pnpm e2e:cors` 都通过。
- AC-03（`用户要求`）：`FW_SLOT=1 pnpm e2e:demo` 全绿。三端的界面 e2e（`FW_SLOT=2 pnpm e2e:mobile`、`FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts`）在真接口上全绿。
- AC-04（`建议采纳`）：新增跨端界面演示链 e2e，用浏览器驱动：店员在 Expo Web 上建单，把冷柜标为不合格，其余合格，上传必拍照片，提交，界面显示 88；主管在 Web 上打开这张单，打回冷柜一项；店员在 Expo Web 上补拍、改为合格、重新提交，界面显示 100；主管在 Web 上通过；总部在 Web 看板上看到 NB-001 显示 100。测试放 `tests/demo/`，配置放 `playwright.demo.config.ts`，用槽位 1，同时起 API、Web、Expo Web；新增一条 `package.json` 脚本 `e2e:demo-ui`，带 `FW_SLOT`。
- AC-05（`用户要求`）：交付与归档：「待人工验收」登记两项：Mobile 原生相机拍照，以及 Expo Go 真机外观与操作。用户确认后，按 FW-004、FW-005、FW-006 的顺序逐个归档（[`howto/archive.md`](../../howto/archive.md)，对账范围按 parallel.md 第 6 节）；Promote 各单元写在「涉及的当前事实」里的 specs；在试行记录里追加 g01 那一段的数据。

## 验收方式

`B Agent 验收`

本单元的 AC 都能用机器验证。AC-05 里的人工项是 FW-005 的验收内容，不是本单元的。

## 涉及的当前事实

- [`specs/inspection.md`](../../specs/inspection.md)、`specs/mobile-inspector.md`（新增）、`specs/web-console.md`（新增）、[`specs/workspace.md`](../../specs/workspace.md)：Promote 三个并行单元的行为。
- [`context/dev-environment.md`](../../context/dev-environment.md)：验证命令补 `e2e:demo-ui` 和 Web 的 e2e 命令。
- [`parallel-trial.md`](../../parallel-trial.md)：追加 g01 一段的数据。

## 依赖

- FW-004
- FW-005
- FW-006

## 批准记录

- 批准依据：用户 2026-10-24 批准并行组 g01 的范围与 5 项默认，并采纳跨端界面演示链，原话"需要我确认的5项全安你建议的来。建议补充的也加上。"
- 批准时间：`2026-10-24`
- 特殊授权：在主目录的 master 上合并、提交，不推送；写入范围：合并冲突涉及的文件、`tests/demo/`、`playwright.demo.config.ts`、根 `package.json` 的 `e2e:demo-ui` 脚本、docs；第 7 节记在本单元的修复按修正模式的速度做；只用 `floorwalk` 角色连 `floorwalk_e2e_N`。
