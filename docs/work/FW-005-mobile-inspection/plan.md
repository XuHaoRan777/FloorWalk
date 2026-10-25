# Mobile 店员巡检 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`in_progress`
- 归档状态：`active`
- 当前任务：回修：Expo 57 原生图片上传 FormData 文件部分不兼容
- 阻塞：Android 真机尚未复测 Expo `File` multipart 上传修复
- 下一步：请用户在 Expo Go 重新加载后复测相册选图上传；确认成功后继续人工验收与归档
- 并行组：g01，并行单元，槽位 2（并行 FW-004、FW-005、FW-006；集成 FW-007）
- 预检：改动限定在 `apps/mobile`、`tests/mobile/`、`playwright.mobile.config.ts`；API、契约、依赖和迁移只读。槽位 2 的数据库与存储可由现有迁移/种子命令初始化。

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

## 任务表

| ID  | 任务                                                             | 状态   | 交付的 AC 与证据                   |
| --- | ---------------------------------------------------------------- | ------ | ---------------------------------- |
| T01 | e2e 配置按槽位起 API 和 Expo Web；登录、保持登录、「我的」与退出 | `done` | AC-01                              |
| T02 | 「今日待巡」                                                     | `done` | AC-02                              |
| T03 | 做巡检：逐项标记、拍照上传、提交                                 | `done` | AC-03                              |
| T04 | 打回单：高亮打回项、主管意见、补拍、重新提交                     | `done` | AC-04                              |
| T05 | 错误提示与 401 回登录                                            | `done` | AC-05                              |
| T06 | 最终代码审查                                                     | `done` | `FW_SLOT=2` 全量门禁一次，再派审查 |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。 -->

## 证据

| 任务     | status  | command                                                                                                                                                                                   | artifact                                                                                                                                                                 | 备注                                                                                                                                                                                                               |
| -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T01-T05  | passed  | `FW_SLOT=2 pnpm e2e:mobile`                                                                                                                                                               | `apps/mobile/components/mobile-app.tsx`, `apps/mobile/lib/api.ts`, `apps/mobile/lib/storage.ts`, `playwright.mobile.config.ts`, `tests/mobile/mobile-inspection.spec.ts` | 6 个 Mobile Web e2e 全部通过：登录/重启/我的/退出、错误密码、今日数据与必拍缺失、照片上传提交、NB-002 打回重提、401 回登录。                                                                                       |
| T01-T05  | passed  | `pnpm --filter @apps/mobile typecheck`                                                                                                                                                    | `apps/mobile`                                                                                                                                                            | TypeScript 通过。                                                                                                                                                                                                  |
| T01-T05  | passed  | `pnpm --filter @apps/mobile lint`                                                                                                                                                         | `apps/mobile`                                                                                                                                                            | ESLint 通过。                                                                                                                                                                                                      |
| T01-T05  | passed  | `pnpm exec prettier --check apps/mobile/components/mobile-app.tsx apps/mobile/lib/api.ts playwright.mobile.config.ts tests/mobile/global-setup.ts tests/mobile/mobile-inspection.spec.ts` | `apps/mobile`, `tests/mobile`, `playwright.mobile.config.ts`                                                                                                             | 格式检查通过。                                                                                                                                                                                                     |
| T01-T06  | passed  | `FW_SLOT=2 FLOORWALK_ENV_FILE=<main-worktree-env> pnpm e2e:mobile`                                                                                                                        | `tests/mobile/mobile-inspection.spec.ts`, `playwright.mobile.config.ts`                                                                                                  | 修复 401 上传回登录、备注串行持久化、启动恢复网络错误提示后，6 个 Mobile Web e2e 全部通过；测试动态读取今日门店、模板、提交标记、打回数量、检查项和必拍项。凭据值未打印。                                          |
| T06      | passed  | `pnpm --filter @libs/shared build && pnpm --filter @apps/mobile typecheck && pnpm --filter @apps/mobile lint`                                                                             | `apps/mobile`                                                                                                                                                            | 修复后 shared 构建、Mobile 类型检查和 lint 通过。                                                                                                                                                                  |
| T06      | passed  | `docs/howto/final-review.md`                                                                                                                                                              | `apps/mobile/components/mobile-app.tsx`, `playwright.mobile.config.ts`                                                                                                   | 独立审查发现的两个 P1 已修复并复核通过：照片上传 401 回登录；备注保留服务端值并在提交前串行保存。                                                                                                                  |
| 回修验证 | passed  | `$env:FW_SLOT='2'; pnpm e2e:mobile`                                                                                                                                                       | `tests/mobile/mobile-inspection.spec.ts`; `apps/mobile/components/mobile-app.tsx`                                                                                        | 6 项 Mobile e2e 全部通过；修复后的就地更新、提交前刷新和忙状态覆盖均通过既有测试。                                                                                                                                 |
| 回修验证 | blocked | `$env:FW_SLOT='1'; pnpm e2e:demo-ui`（一次）                                                                                                                                              | `tests/demo/inspection-chain.spec.ts`; `tests/web-results/demo-slot-1`                                                                                                   | Mobile 提交请求已通过并完成主管操作；随后同一 Playwright context 新建 HQ 页面继承主管 localStorage 会话，根路径自动进入控制台，测试等待邮箱输入框超时。按用户要求未修改 tests/demo；需后续单独处理测试上下文问题。 |
| 回修复核 | passed  | `独立 Subagent 只读复核本次 FW-005 回修`                                                                                                                                                  | `apps/mobile/components/mobile-app.tsx`; `apps/mobile/lib/api.ts`; `docs/work/FW-005-mobile-inspection/plan.md`                                                          | 未发现 P1/P2 正确性缺陷；确认就地更新、提交前刷新、忙状态禁用和错误提示保留均符合修复要求。现有 e2e 未覆盖快速并发点选；T04 未全绿属于既有测试上下文问题。                                                         |
| 回修验证 | passed  | `pnpm --filter @apps/mobile typecheck`; `pnpm --filter @apps/mobile lint`                                                                                                                 | `apps/mobile/lib/api.ts`                                                                                                                                                 | Platform 原生/Web 上传分支调整后类型检查与 lint 通过。                                                                                                                                                             |
| 回修验证 | blocked | `$env:FW_SLOT='2'; pnpm e2e:mobile`；`$env:FW_SLOT='2'; pnpm exec playwright test --config=playwright.mobile.config.ts --grep "必拍项可以选择照片"`                                       | `tests/mobile/mobile-inspection.spec.ts`; `apps/mobile/lib/api.ts`                                                                                                       | 两次运行均卡在 `page.goto('/')`，3122 Expo Web 页面不返回；第二次检查时 Metro 进程占用异常增长，未进入照片上传步骤。无法据此判断业务回归结果，待服务问题解决后再验证。                                             |
| 回修验证 | passed  | `pnpm --filter @apps/mobile typecheck`; `pnpm --filter @apps/mobile lint`                                                                                                                 | `apps/mobile/lib/api.ts`                                                                                                                                                 | 图片上传 fetch 异常现在会在 Metro 终端打印原始错误对象及请求方法、路径；类型检查与 lint 通过，待 Android 真机复测取回日志。                                                                                             |
| 回修验证 | passed  | `pnpm --filter @apps/mobile typecheck`; `pnpm --filter @apps/mobile lint`; `pnpm --filter @apps/mobile check`                                                                               | `apps/mobile/lib/api.ts`; `apps/mobile/components/mobile-app.tsx`; `apps/mobile/package.json`                                                                            | Expo 57 的 `expo/fetch` multipart 转换不支持 RN `{ uri, name, type }` 文件部分；改用 `expo-file-system` `File` 对象。类型、lint、Expo 依赖版本检查通过，Android 真机上传仍待人工复测。                                    |

<!-- 行格式见 AGENTS.md 第 7 节。截图存本单元 `evidence/`，artifact 只写代码格式的路径。 -->

## 回修

| 日期       | 反馈                                                                                                                            | 改动                                                                                                               | 提交   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| 2026-10-25 | FW-007 T04 发现快速连续点选后检查项更新响应乱序，提交使用旧 detail 并吞掉「请完成」提示；按 parallel.md 第 7 节归为 FW-005 回修 | 使用 PATCH/上传响应就地更新单项；提交前刷新 detail，更新在途时禁用提交；load 不再清除操作错误                      | 待提交 |
| 2026-10-25 | 用户报告原生图片上传提示“提交内容有误”，Expo 输出 `Response.blob()` 性能警告                                                    | 用 `Platform.OS === 'web'` 识别 Web；原生直接以 `{ uri, name, type }` 上传，避免把 React Native 环境误走 Blob 分支 | 待提交 |
| 2026-10-25 | 用户确认 Android 上只有图片上传提示“网络连接失败”，请求增加完整错误日志便于定位                                                       | 仅图片上传请求的 fetch 异常在 Metro 终端打印原始错误对象、请求方法与接口路径                                      | 待提交 |
| 2026-10-25 | 终端报错 `Unsupported FormDataPart implementation`；Expo 57 的 `expo/fetch` 不接受 RN 专用 `{ uri, name, type }` 上传部分             | 原生分支改用 `expo-file-system` `File`（支持 `bytes()`）；添加直接依赖，Web 分支保持 Blob 上传                    | 待提交 |

## 决策与偏差

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。 -->

- 2026-10-24 用户默认：打回后店员能改所有项，界面只高亮被打回的项，不强制重拍；不做「记录」页；界面 e2e 对照 API 返回，不写死数值。
- 2026-10-24：Mobile e2e 的 API webServer 使用 `nest start --watch` 时在测试间重编译导致 dist 入口短暂缺失；改为一次性 `nest start`，槽位 2 全量 e2e 稳定通过。
