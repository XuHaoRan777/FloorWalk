# 个人中心（两端） - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`in_progress`
- 归档状态：`active`
- 当前任务：T05 最终代码审查
- 阻塞：无
- 下一步：T04 API 改密回归 7 项、Web 与 Mobile Web 个人中心各 4 项已通过，槽位 1 与本任务模拟器资源已收尾；提交 T04 后完成受影响模块全量验证与独立最终审查；本单元 verified 后接力 FW-036

<!-- Preflight：编码前在此写一到三行——要动哪些模块；涉及既有数据时的只读统计计数；后端/库/开发者工具是否能起。不需要章节名。 -->

Preflight（2026-11-17）：起点 `2714719`，上游 FW-034 已 verified，其单元提交在当前分支；工作区干净，文档校验 0 问题。预计修改 shared 本人资料契约、API 用户头像前向迁移与接口、Web/Mobile 个人页及仓库内对应测试；新增结构仅指向 AC-01、AC-02、AC-04、AC-05。

Preflight：`local-pg18` 正常发布 5433，开发与槽位 1 服务无监听，`proc.mjs status` 为空，未连接模拟器。仅以 `floorwalk` 角色连接开发库 `floorwalk` 做只读计数：账号 16，管理员 2，店长 14；未写库、未启动服务。后续使用槽位 1 及既有 API37 AVD，服务经 `scripts/dev/proc.mjs` 起停；API 启动探针待规格阻塞解除后执行。

Preflight：已读 `ui-skills-root`、`fixing-accessibility`、`expo-overview`、`expo-ui`、`expo-native-ui`、`expo-data-fetching`；Expo 58.0.24 的 imagepicker、filesystem、UI 官方页均返回 200。`--env-keys` 仍报告无可检查配置，沿用接力探针中的用户手动核对，不声称配置齐全。

Preflight（T03，2026-11-17）：T02 已本地提交 `7cba112`，`pnpm --filter @apps/api build` 通过。原生准备前已确认槽位 1 的 3110/3111/3112 无监听，`proc.mjs status` 与 `adb reverse --list` 为空，本任务尚未启动 API/Metro。已启动本任务的 `Medium_Phone_API_37.0`（启动器 PID `99824`，设备 `emulator-5554`），`sys.boot_completed=1`，Expo Go `58.0.5`；已将槽位 1 的仓库种子 JPEG（533 字节）推至 `/sdcard/Pictures/fw035-avatar.jpg`，媒体扫描广播返回 0。该图片和模拟器均由本任务收尾；尚未启动应用、未取得原生 AC 证据。

## 任务表

| ID  | 任务                              | 状态          | 交付的 AC 与证据                                                                           |
| --- | --------------------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| T01 | 头像持久化与共享本人资料契约      | `done`        | 无，机器门                                                                                 |
| T02 | Web 个人资料、昵称与头像          | `done`        | AC-02：本人改昵称、店长 403；Web 资料与头像切片                                            |
| T03 | Mobile 两角色个人页与原生头像上传 | `done`        | AC-01、AC-04：两端头像、资料字段与入口；原生系统图片选择、上传和刷新                       |
| T04 | 主动改密与跨端会话吊销            | `done`        | AC-03、AC-05：普通与首次改密、其他端登出、只操作本人与一小时签名、过期签名 403、刷新持久化 |
| T05 | 最终代码审查                      | `in_progress` | 受影响模块套件、类型、lint、格式、构建与独立只读审查                                       |

<!-- 状态：pending / in_progress / blocked / done。批准时不超过 8 行，最后一项是"最终代码审查"。
方式 B 按用户可观察的切片切，不按数据、后端、前端分层切：每行写交付哪几条 AC，并在本任务内取得它们的证据；一条 AC 跨几个切片时记在完成它的那个任务。可以有一个先行任务只做数据结构与共享契约（表、迁移、共享类型，不含接口和页面），这一列写「无，机器门」。不设"Agent 验收""机器门汇总"这类只收集其他任务证据的任务；单元结束的全量套件和构建在「最终代码审查」任务里、派审查之前跑。
方式 A 切法不限；第 14 节的认证、支付、权限失败路径，在交付它们的任务里用测试取证。 -->

## 证据

| 任务 | status  | command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | artifact                                                                                                                                                                                                       | 备注                                                                                                                                                                                                                                                                                                                                                           |
| ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | blocked | 只读核对本人接口、存储驱动及共享路由                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `packages/shared/src/contract/index.ts`、`apps/api/src/controllers/auth.controller.ts`、`apps/api/src/storage/local.ts`                                                                                        | `/api/me` 无目标用户或商家参数；签名存储读取是持有链接即可访问，不按访问者商家鉴权，不能把它当作跨商家 404 的验收对象。尚未写业务代码或新增契约。                                                                                                                                                                                                              |
| T01  | passed  | `pnpm --filter @libs/shared build`; `pnpm --filter @libs/shared typecheck`; `pnpm --filter @apps/api typecheck`; `pnpm --filter @apps/api exec drizzle-kit check`; `pnpm exec eslint packages/shared/src/contract/identity.ts packages/shared/src/contract/users.ts packages/shared/src/contract/index.ts apps/api/src/db/base-schema.ts`; `pnpm exec prettier --check packages/shared/src/contract/identity.ts packages/shared/src/contract/users.ts packages/shared/src/contract/index.ts apps/api/src/db/base-schema.ts apps/api/drizzle/meta/_journal.json apps/api/drizzle/meta/0017_snapshot.json`; `git diff --check`; `python scripts/validate_docs.py` | `packages/shared/src/contract/identity.ts`、`packages/shared/src/contract/users.ts`、`packages/shared/src/contract/index.ts`、`apps/api/src/db/base-schema.ts`、`apps/api/drizzle/0017_fw035_profile.sql`      | 共享本人资料契约、严格昵称/头像上传元数据、路由角色与强制改密白名单、可空头像存储键及前向迁移已通过机器门；未写入业务接口。                                                                                                                                                                                                                                    |
| T02  | passed  | `FW_SLOT=1 AI_REVIEW_DRIVER=fake STORAGE_DRIVER=local pnpm --filter @apps/api test src/tests/profile.test.ts`; `FW_SLOT=1 AI_REVIEW_DRIVER=fake STORAGE_DRIVER=local pnpm --filter @apps/api test src/tests/contract.e2e.test.ts`; `FW_SLOT=1 pnpm e2e --config=playwright.web.config.ts tests/web/profile.spec.ts`; API/Web 类型、lint 与定向格式检查                                                                                                                                                                                                                                                                                                          | `apps/api/src/tests/profile.test.ts`、`apps/api/src/tests/contract.e2e.test.ts`、`tests/web/profile.spec.ts`                                                                                                   | AC-02：管理员本人昵称 1～30 字、空白/超长/他人参数 400、店长 403；本人资料 API 4 项、契约回归 15 项、两角色 Web e2e 2 项通过。Web 已验证资料、角色、店长门店与昵称只读、头像上传后刷新仍可读取、管理员昵称持久化及退出登录；原生上传和跨端改密仍由 T03/T04 完成。Web 用例恢复原昵称、原头像键及已有头像对象，清理新对象并退出本次会话。                        |
| T03  | passed  | `FW_SLOT=1 pnpm e2e --config=playwright.mobile.config.ts tests/mobile/profile.spec.ts`；Mobile 类型、目标文件 ESLint/Prettier 与 `git diff --check`；Android 系统相册选图、`adb -s emulator-5554 shell uiautomator dump /sdcard/window.xml` 与刷新资料；使用现有 seed/storage 恢复槽位 1                                                                                                                                                                                                                                                                                                                                                                        | `tests/mobile/profile.spec.ts`、`apps/mobile/components/mobile/profile-screen.tsx`、`docs/work/FW-035-profile/evidence/mobile-manager-avatar.png`、`docs/work/FW-035-profile/evidence/mobile-admin-avatar.png` | Mobile Web 2 passed。AC-01/04：Android API 37、Expo Go 58.0.5，两角色从系统相册上传 JPEG 后显示当前头像，刷新资料后仍显示；管理员有昵称编辑入口，店长昵称只读，登录名、角色与店长门店符合。已恢复 `floorwalk_e2e_1` 种子、删除本次 2 个头像对象，头像与会话记录均为 0；API/Metro 已停止，模拟器清理待核对。                                                    |
| T04 | passed | `FW_SLOT=1 AI_REVIEW_DRIVER=fake STORAGE_DRIVER=local pnpm --filter @apps/api test src/tests/users.test.ts`；`FW_SLOT=1 pnpm e2e --config=playwright.web.config.ts tests/web/profile.spec.ts`；`FW_SLOT=1 pnpm e2e --config=playwright.mobile.config.ts tests/mobile/profile.spec.ts`；API/Mobile 类型、目标文件 ESLint/Prettier、`git diff --check`、`python scripts/validate_docs.py`；现有 `resetSlotResources` 恢复槽位 1，`adb` 清理并核对任务模拟器临时文件 | `apps/api/src/tests/users.test.ts`、`tests/web/profile.spec.ts`、`tests/mobile/profile.spec.ts`、`apps/mobile/app/(authenticated)/_layout.tsx` | API 7 passed、Web 4 passed、Mobile Web 4 passed，目标类型、lint、格式、差异及文档检查通过。首次与普通状态改密保留当前会话并吊销本人其他会话，夹带真实他人 userId 不影响对方账号；两端两角色均使用隔离浏览器上下文，改密后当前会话刷新仍登录，另一会话刷新后回到登录页。API 用例清理新建用户与会话，界面用例恢复原密码哈希和强制改密标记、删除新建会话。槽位 1 已恢复为 16 个种子用户、0 个会话、39 个种子文件；任务模拟器临时文件已确认删除并正常关闭设备，3110/3111/3112/5554/5555 无监听，共享 adb 服务保留。 |

<!-- 行格式见 AGENTS.md 第 7 节。status：passed / failed / blocked / skipped。evidence/ 不入库，artifact 只写代码格式的路径。 -->

## 回修

<!-- 交付后、归档前用户的反馈，一条一行：日期、用户说的、改了什么、提交号；改到 AC 的写用户原话；带「硬线：」的提交在归档前补审，补审记进证据表。归档后的反馈进 testlog。 -->

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

- 资源收尾（T03，2026-11-17）：已恢复槽位 1 种子并删除本次 2 个头像对象，头像与会话记录均为 0；API/Metro 已停止，3110/3111/3112/5554/5555 无监听，Android 设备列表为空。清理时 `adb reverse --remove` 无响应，核对归属后关闭本任务模拟器进程树；虚拟机内临时图片待 T04 原生检查时确认清理，不声称设备文件已删除。

<!-- 只记会影响后续的：用户决策、放弃的方案、发现的范围外问题。每条一行。归档时把仍然重要的升入 adr/、specs/ 或 pitfalls.md。 -->

- 卡在哪（2026-11-17）：AC-05 要求「跨商家 404」，但仅指定 `/me` 本人写接口；当前代码无头像读取接口，无法确定跨商家目标请求，按内核第 7 节「AC 无法客观验证」停止实现。
- 要用户定什么：明确头像签名的读取入口和权限边界，形成可实际请求并验证的 AC-05。
- 可选项和倾向：建议补充 `GET /api/users/:id/avatar-url`，仅本人可读取，非本人（含跨商家）统一 404；或仅随 `/api/me` 返回头像链接，将该句修订为「只能读取、修改本人资料，无他人查询入口」。两种均待用户选择，不自行更改批准规格。
- 用户决策（2026-11-17）：原话"改"，选选项 2。AC-05 改为"本人资料接口只按会话操作、头像链接只随 `GET /api/me` 返回、过期签名 403"；不新增他人头像读取接口，非目标加一行"不显示别人的头像"。现有 `GET /storage/*key` 只校验签名、不按商家判断，所以不写"跨商家 404"。
