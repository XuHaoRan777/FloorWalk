# 并行组 g02 集成 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`blocked`
- 归档状态：`active`
- 当前任务：T05 模拟器原生回归
- 阻塞：原生 Metro 启动命令被执行策略拒绝（`blocked by policy`），AC-05 尚未取证。
- 下一步：恢复获准的原生 Metro 启动途径后，在本对话继续 T05，再执行 T06/T07；不以 Expo Web 代替原生证据。
- 并行组：g02，集成单元（并行 FW-012、FW-013、FW-014）

Preflight：在主目录 master 上做。第一步核对 `git tag --list "g02/done/*"` 三个齐全、`g02/close` 已打。T05 动 Mobile 前先读 `~/.agents/skills/expo-overview`，在证据里记一行。

## 任务表

| ID  | 任务                                                                                                       | 状态      | 交付的 AC 与证据                                     |
| --- | ---------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------- |
| T01 | 合并：按单元号顺序合并三个分支，合并前核对契约等路径                                                       | `done` | AC-01                                                |
| T02 | 全量门禁                                                                                                   | `done` | AC-02                                                |
| T03 | 演示链与各端界面 e2e，全部连真接口；先修 Web e2e 的 `API_PUBLIC_BASE_URL` 并删掉 FW-012 的 `/storage` 改写 | `done` | AC-03、AC-07                                         |
| T04 | 跨端界面演示链扩展                                                                                         | `done` | AC-04                                                |
| T05 | 模拟器原生回归                                                                                             | `blocked` | AC-05                                                |
| T06 | 交付与归档：按顺序归档 FW-012～014，Promote                                                                | `pending` | AC-06（并行单元部分）                                |
| T07 | 最终代码审查：只审本单元自己的改动（冲突解法、T04、第 7 节记在本单元的修复）；审完写试行记录，归档本单元   | `pending` | 全量门禁一次，再派独立 Subagent；AC-06（本单元部分） |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status | command | artifact | 备注 |
| ---- | ------ | ------- | -------- | ---- |
| T01 | passed | `git diff --stat g02/start g02/FW-012|013|014 -- packages/shared/src/contract apps/api/src/db/schema.ts apps/api/drizzle "**/package.json" pnpm-lock.yaml`; `git merge --no-ff --no-edit g02/FW-012|013|014` | `git log --oneline --merges master` | 顺序合并完成；三支敏感路径均无差异。FW-013、FW-014 各有 1 个 `docs/backlog.md` 相邻状态冲突，按 master 表格保留并只带入该单元 `verified` 状态；按 parallel.md 规则不计入冲突文件数，其他冲突文件数 0。 |
| T02 | passed | `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm build`; `$env:FW_SLOT='1'; pnpm --filter @apps/api test`; `pnpm e2e:slots`; `$env:FW_SLOT='1'; pnpm e2e:cors` | `pnpm typecheck`; `pnpm build`; Playwright reports | 全量门禁通过：API 44/44、三槽位隔离 3/3、CORS 3/3；测试服务已退出。 |
| T03 | passed | `$env:FW_SLOT='1'; pnpm e2e:demo`; `$env:FW_SLOT='1'; pnpm exec playwright test --config=playwright.web.config.ts`; `$env:FW_SLOT='1'; pnpm e2e:mobile` | `tests/web-results/slot-1`; Playwright reports | API 演示链通过；Web 12/12、Mobile 16/16。Web 配置补槽位 `API_PUBLIC_BASE_URL`、NO_PROXY 并串行共享槽位测试；图片回源不再改写 `/storage`，断言 `naturalWidth > 0`。首轮发现服务探测走代理并误判 400、Web/Mobile 并发测试共享种子数据，已按根因修复并由全量重跑通过。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

| T04 / AC-04 | passed | `$env:FW_SLOT='1'; pnpm e2e:demo-ui` | `tests/demo/inspection-chain.spec.ts` | 最终版 1/1（31.4s）：三角色独立 newContext；88 分提交、打回、详情打开后轮询看到主管原因（5 秒）、图文回复且主管轮询看到（5 秒）、图片自然宽度大于 0、补拍 100 分并通过、记录首行 ID 与本次单一致且只读、有聊天、总部停用无未审单的 NB-001 后看板标已停用。恢复启用；afterEach 事务删除本次巡检/检查项/照片/审核/聊天行，再删除对应照片文件；测试服务已退出。 |
| T05 / AC-05 | blocked | `emulator -avd Medium_Phone_API_37.0 -no-window`; `adb ...`; `pnpm --filter @apps/mobile exec expo start --lan --clear --port 3112` | `apps/mobile/package.json` | 已读 expo-overview 与 launch-without-dev-menu；SDK 57.0.31，AVD Android 17 启动成功，Expo Go 已安装。原生 Metro 两次启动被执行策略拒绝（blocked by policy），未进行登录/上传/聊天/记录/冷启动或 logcat 验收，不声称 AC-05 通过。任务启动的 API、AVD、5038 ADB 服务及 reverse 映射已清理；已有 5037 ADB 未动。 |

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 2026-10-29 "值不值"判据见 [试行记录](../../parallel-trial.md)：集成阶段归到某个并行单元的回修不超过 1 个，且人工触点按单元平均不多于串行基线（FW-008、FW-009、FW-010 为 3、3、4，平均约 3.3）为值。
- 人工触点由 Claude 在复核时按类别补记，归档时以复核数为准。
- 2026-10-29 FW-012 定位到 AC-05 的根因：`playwright.web.config.ts` 的槽位 API 环境没设 `API_PUBLIC_BASE_URL`，签名图片地址指向开发环境的 3018；从 g01 起 Web e2e 的证据照片都没真正加载，旧断言只数 `img` 个数。FW-012 在自己测试里临时把 `/storage` 改写到槽位 API；本单元 T03 修配置、删绕过、加强断言（AC-07），算集成单元自己的修复，计入「集成回修」时注明不归并行单元。
- T01 冲突解法：FW-013、FW-014 都只冲突在 `docs/backlog.md`；按并行流程用 master 版本为底，仅更新各自状态为 `verified`，并将 FW-015 更新为 `in_progress`。
- T03 验证偏差：Web 与 Mobile e2e 使用同一个槽位演示库，多个用例会变更门店和审核状态；默认并发造成互相污染。按隔离根因将两套 UI e2e 配为单 worker，避免更改业务数据语义。
- T04 首轮失败：对 Expo Web Image 的外层元素读取 naturalWidth 得到 undefined；最终版改查其内部 img 的 complete/naturalWidth，保留实际图片解码断言。第二轮超时因巡检详情隐藏底部 Tabs；已改为返回今日页后打开记录。后续收紧轮询证据：店员先打开详情并等初始聊天请求完成，再由主管发消息；最终重跑通过。
- 2026-10-29 用户明确批准扩围修改 playwright.mobile.config.ts 的 workers 为 1；默认 pnpm e2e:mobile 已重跑 16/16。
- T05 执行策略拒绝原生 Metro 启动后，曾把槽位 API 临时监听改为 3018，未解决阻塞且不应作为绕过；已停止并恢复无任务监听进程。后续不换端口或包装命令规避拒绝，等可获准的启动途径。
- T01 三个 merge commit 使用了 Git 默认消息，未含 FW-015（6eafbef、8317212、2979330）；在此明确归属 FW-015 T01，不重写已有合并历史。


### T05 用户指定命令复试（2026-10-29）

- 执行目录：`F:\project\FloorWalk\apps\mobile`。
- 用户要求：原命令复试一次；若仍拒绝，保存完整原文并打 `g02/blocked/FW-015`，不换端口或包装方式。
- 命令原文（status：`blocked`，AC-05 未取证）：

```powershell
$env:EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:3110/api'
$env:RCT_METRO_PORT='3112'
$env:REACT_NATIVE_PACKAGER_HOSTNAME='127.0.0.1'
expo start --lan --android --port 3112
```

- 工具返回的拒绝提示完整原文：

```text
exec_command failed: CreateProcess { message: "Rejected(\"`\\\"C:\\\\\\\\Users\\\\\\\\29019\\\\\\\\.cache\\\\\\\\codex-runtimes\\\\\\\\codex-primary-runtime\\\\\\\\dependencies\\\\\\\\native\\\\\\\\powershell\\\\\\\\pwsh.exe\\\" -Command '$env:EXPO_PUBLIC_API_BASE_URL='\\\"'http://127.0.0.1:3110/api'\\n\\\"'$env:RCT_METRO_PORT='\\\"'3112'\\n\\\"'$env:REACT_NATIVE_PACKAGER_HOSTNAME='\\\"'127.0.0.1'\\nexpo start --lan --android --port 3112\\\"` rejected: blocked by policy\")" }
```

- 本次未启动任何进程；未改端口、未换包装方式重试。已有 5037 ADB 服务保持不变。阻塞记录提交后打 `g02/blocked/FW-015`。
