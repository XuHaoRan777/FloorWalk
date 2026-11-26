# FloorWalk 工作单元索引

规则见 [`AGENTS.md`](../AGENTS.md) 第 3、6、10 节。本页四张表：上线所需能力（方向）、当前工作（活动单元）、待开单元（队列）、待人工验收（等用户）。修正模式的改动不在这里，在 [`testlog.md`](testlog.md)。

## 上线所需能力

用户可见能力的现状，不是任务表。待开单元只从这里派生；一项能力标 `有` 的依据是对应 `specs/` 小节，不是单元归档。2026-11-09 按重定的[产品基线](context/product.md)整表改写。

| 能力                                                                                                         | 现状 `有\|部分\|无` | 依据 / 缺口                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 多商家数据隔离                                                                                               | 有                  | [巡检主链](specs/inspection.md)                                                                                                                          |
| 商家注册（邮箱验证码）、管理员找回密码                                                                       | 有                  | [巡检主链](specs/inspection.md)；注册邮箱验证与管理员验证码找回已接入假邮件和 Resend 模板驱动                                                           |
| 两层角色：一商家一个管理员、一店多店长、店长只属一店、调店                                                   | 有                  | [巡检主链](specs/inspection.md)、[门店与模板管理](specs/admin.md)；数据库保证每商家一个管理员、店长绑定单店，管理员可调店                                |
| 账号：管理员建店长并设昵称，登录名为邮箱或手机号，跨商家同名登录后选商家；初始密码强制修改、重置、停用即吊销 | 部分                | [巡检主链](specs/inspection.md)、[Web 控制台](specs/web-console.md)；有强制改密、重置、停用与跨商家同名选择，登录名按通用文本接受，未限制为邮箱或手机号  |
| 会话滑动续期                                                                                                 | 有                  | 闲置超过 7 天失效，[巡检主链](specs/inspection.md)                                                                                                       |
| 个人中心（头像、改密码，管理员改昵称）                                                                       | 有                  | [Mobile 店长巡检](specs/mobile-inspector.md)、[Mobile 管理端](specs/mobile-admin.md)、[Web 控制台](specs/web-console.md)；两端资料、头像与改密入口已实现，管理员可改昵称 |
| 门店管理、停用、分配店长                                                                                     | 有                  | [门店与模板管理](specs/admin.md)；账号创建或调店时绑定门店                                                                                               |
| 多模板，检查项含严重项、最少张数（0 不拍）、验收要点                                                         | 有                  | [门店与模板管理](specs/admin.md)；每个日程任务选择所用模板                                                                                               |
| AI 审核标准库、模板开关 AI、三套快捷配置                                                                     | 有                  | [门店与模板管理](specs/admin.md)、[巡检主链](specs/inspection.md)；模板已接入逐条审核引擎                                                                  |
| 日程方案、门店日程安排（选用、跳过日期区间）、每日生成任务                                                   | 有                  | [日程方案与门店安排](specs/schedules.md)；任务生成由巡检主链同步                                                                                         |
| 今日任务、只能相机拍、时间窗与宽限、多人逐条上传与覆盖、逐项自评                                             | 有                  | [巡检主链](specs/inspection.md)、[Mobile 店长巡检](specs/mobile-inspector.md)；今日任务、相机上传/重传、自评和调店后参与记录可见均已实现                  |
| AI 逐条审核（通过、打回、属实不合格、失败转人工）                                                            | 有                  | [巡检主链](specs/inspection.md)；真模型合成样本与 Mobile 店长端上传体验已验收，真实门店照片样本仍未覆盖                                                       |
| 判定与分数：判定时间、分数、整单结论、改判、关闭 AI 时人工审                                                 | 有                  | [巡检主链](specs/inspection.md)、[Web 控制台](specs/web-console.md)、[Mobile 管理端](specs/mobile-admin.md)；两端管理员均可逐条判定与改判                      |
| 今日视图与看板（完成率、逾期、自检准确率、分数；门店、店长、日期）                                           | 有                  | [Web 控制台](specs/web-console.md)、[Mobile 管理端](specs/mobile-admin.md)；今日视图和周/月看板均已实现                                                       |
| Mobile 管理端，功能与 Web 相同                                                                               | 有                  | [Mobile 管理端](specs/mobile-admin.md)；配置、审核、今日视图、看板、个人资料与通知入口已实现                                                               |
| 巡检单聊天                                                                                                   | 有                  | [巡检单聊天](specs/chat.md)                                                                                                                              |
| Mobile 本店记录                                                                                              | 有                  | [Mobile 店长巡检](specs/mobile-inspector.md)                                                                                                             |
| 站内通知                                                                                                     | 有                  | [站内通知](specs/notifications.md)；七类事件、本人 API 收件箱及 Web/Mobile 管理员和店长入口已实现                                                        |
| 照片与头像存阿里云 OSS                                                                                       | 部分                | 存储驱动支持 OSS；当前配置使用本地存储，[工程骨架](specs/workspace.md)                                                                                  |
| 两端统一样式 | 部分 | Web：FW-041 钴蓝运营台、FW-042～FW-043 逐页、FW-044 品牌与点缀已完成；Mobile：FW-047 店长端与视觉基础正在实现，后续按下方队列完成管理员主路径、管理页和公共页 |
| 演示数据与演示说明                                                                                           | 部分                | [巡检主链](specs/inspection.md)；Northbean 种子现含历史任务、逐条结果与判定记录；正式演示说明待定                                                        |

## 当前工作

只列 `归档状态：active` 的单元；表格由 `python scripts/validate_docs.py --sync-backlog` 按各单元 `plan.md` 生成，普通校验检查个数上限与状态一致性。

| ID | 工作单元 | 状态 | 依赖 | 下一步 |
| --- | --- | --- | --- | --- |

## 待开单元（未批准，按建议顺序）

编号在开单时分配；前置里的数字指本表的顺序。2026-11-09 按重定的[产品基线](context/product.md)整表重排，取代 2026-11-01 版（g04/g05 草案、协议与集成单元不再沿用）。验收方式按目标预估，开单时按各单元 AC 再定。FW-047 建立 Mobile 店长端视觉基础，后续 Mobile 页面单元沿用它的 tokens 和公共组件；Web 视觉基线维持现状。线尾走方式 A 时，顺带检查基线里标「AI 定」的条目。2026-11-19 FW-040 归档后，用户指出 Web 主题样式与 Mobile 布局样式都还没做：此前 AI 把只查布局的评审结论说成"桌面无需打磨"，把"Mobile 先跳过"误写成移出队列，本次补回第 1～3 项。2026-11-20 开立 FW-042，按用户确认的七页布局表开展 Web 页面视觉整理，验收方式 A。

| 顺序 | 目标 | 前置 | 类型 |
| ---- | ---- | ---- | ---- |
| 1 | 管理员主路径：今日、审核队列、审核详情、看板、通知、我的 | FW-047 | 单独 · A |
| 2 | 管理：管理首页、账号、门店、模板、标准、排班、门店排班 | 1 | 单独 · A |
| 3 | 公共页：登录、找回密码、修改密码、404，并删除 __design-samples 路由 | 2 | 单独 · A |
| 4 | 演示：数据和说明，内容到时再定（基线「演示」待定，定之前不开单） | 3 | 待定 |

## 待人工验收

| 单元 | 待验收内容 | 证据 |
| --- | --- | --- |

方式 A 交接里「需要你测的」那一行登记在这里；用户一句确认即归档对应单元，不设集中验收单元。并行组的单元在集成单元合并后才登记（[`howto/parallel.md`](howto/parallel.md)）。

| 单元 / 任务 | 需要你测的 | 交接位置 |
| ----------- | ---------- | -------- |

## 已归档

| ID     | 工作单元                                                                            | 归档日期   | 提交                                                      |
| ------ | ----------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| FW-046 | [Mobile 视觉语言与两张样板页](work/FW-046-mobile-visual-language/spec.md) | 2026-11-24 | 方式 A 确认、Promote、机器门与独立审查（见 git log） |
| FW-045 | [Mobile 视觉基础与样板页](work/FW-045-mobile-visual-foundation/spec.md) | 2026-11-23 | Android 样板验收、Promote、最终审查与归档（见 git log） |
| FW-047 | [Mobile 店长端页面与视觉基础](work/FW-047-mobile-manager-visual-foundation/spec.md) | 2026-11-26 | AC-14 方式 A 确认、Promote、全量机器门与归档提交（见 git log） |
| FW-003 | [巡检主链契约修订](work/FW-003-contract-revision/spec.md)                           | 2026-10-24 | 归档提交（见 git log）                                    |
| FW-002 | [巡检主链契约与骨架](work/FW-002-inspection-contract/spec.md)                       | 2026-10-24 | 归档提交（见 git log）                                    |
| FW-001 | [Monorepo 骨架与各模块启动](work/FW-001-monorepo-bootstrap/spec.md)                 | 2026-10-06 | `9107da6`（修正、验收与 Promote；归档状态见后续归档提交） |
| FW-004 | [巡检业务规则 API](work/FW-004-inspection-api/spec.md)                              | 2026-10-25 | 并行组 g01 归档提交（见 git log）                         |
| FW-005 | [Mobile 店员巡检](work/FW-005-mobile-inspection/spec.md)                            | 2026-10-25 | 并行组 g01 归档提交（见 git log）                         |
| FW-006 | [Web 主管审核与总部看板](work/FW-006-web-review/spec.md)                            | 2026-10-25 | 并行组 g01 归档提交（见 git log）                         |
| FW-007 | [并行组 g01 集成](work/FW-007-g01-integration/spec.md)                              | 2026-10-25 | 并行组 g01 归档提交（见 git log）                         |
| FW-008 | [按功能拆模块](work/FW-008-module-split/spec.md)                                    | 2026-10-26 | 按任务本地提交及归档提交（见 git log），未推送            |
| FW-009 | [会话改为 HttpOnly cookie 与服务端会话表](work/FW-009-web-httponly-session/spec.md) | 2026-10-27 | 按任务本地提交，未推送（见 git log）                      |
| FW-010 | [API 共用数据库连接池](work/FW-010-shared-db-pool/spec.md)                          | 2026-10-28 | 归档提交（见 git log）                                    |
| FW-011 | [g02 契约：聊天、门店与模板、记录页](work/FW-011-g02-contract/spec.md)              | 2026-10-29 | 任务提交、收尾提交及归档提交，未推送（见 git log）        |
| FW-012 | [巡检单聊天](work/FW-012-chat/spec.md)                                              | 2026-10-29 | FW-015 T06 按序 Promote 与归档（见 git log），未推送      |
| FW-013 | [门店与模板管理](work/FW-013-sites-templates-admin/spec.md)                         | 2026-10-29 | FW-015 T06 按序 Promote 与归档（见 git log），未推送      |
| FW-014 | [Mobile 记录页](work/FW-014-mobile-records/spec.md)                                 | 2026-10-29 | FW-015 T06 按序 Promote 与归档（见 git log），未推送      |
| FW-015 | [并行组 g02 集成](work/FW-015-g02-integration/spec.md)                              | 2026-10-29 | 本地集成、原生回归、审查及归档提交（见 git log），未推送  |
| FW-016 | [UI 基础：两端统一设计](work/FW-016-ui-foundation/spec.md)                          | 2026-11-03 | 阶段提交、修正与归档提交（见 git log）                    |
| FW-017 | [g03 协议：多商家、账号、存储与 AI 接口](work/FW-017-g03-protocol/spec.md)          | 2026-11-03 | T07 定向复核与归档提交（见 git log）                      |
| FW-018 | [多商家隔离与门店范围](work/FW-018-org-isolation/spec.md)                           | 2026-11-03 | FW-023 T05 Promote 与归档提交                             |
| FW-019 | [商家注册与门店指派主管](work/FW-019-org-signup-site-supervisor/spec.md)            | 2026-11-03 | FW-023 T05 Promote 与归档提交                             |
| FW-020 | [账号体系与会话续期](work/FW-020-accounts/spec.md)                                  | 2026-11-03 | FW-023 T05 Promote 与归档提交                             |
| FW-021 | [阿里云 OSS 存储驱动](work/FW-021-oss-storage/spec.md)                              | 2026-11-03 | FW-023 T05 Promote 与归档提交                             |
| FW-022 | [AI 审核适配器](work/FW-022-ai-reviewer/spec.md)                                    | 2026-11-03 | FW-023 T05 Promote 与归档提交                             |
| FW-023 | [并行组 g03 集成](work/FW-023-g03-integration/spec.md)                              | 2026-11-03 | T03 AC-04 按更新口径通过；T06 清理、独立审查与归档        |
| FW-024 | [角色收成两层](work/FW-024-two-roles/spec.md)                                       | 2026-11-12 | 本地 Promote 与接力线归档提交（见 git log）                |
| FW-025 | [注册邮箱验证与管理员找回密码](work/FW-025-email-verify-recovery/spec.md)           | 2026-11-12 | 本地 Promote 与接力线归档提交（见 git log）                |
| FW-026 | [模板与 AI 审核标准](work/FW-026-templates-ai-criteria/spec.md)                     | 2026-11-12 | 本地 Promote 与接力线归档提交（见 git log）                |
| FW-027 | [日程方案与门店日程安排](work/FW-027-schedules/spec.md)                             | 2026-11-12 | 本地 Promote 与接力线归档提交（见 git log）                |
| FW-028 | [任务与条目状态机](work/FW-028-task-state-machine/spec.md)                          | 2026-11-12 | 本地 Promote 与接力线归档提交（见 git log）                |
| FW-029 | [Mobile 店长端](work/FW-029-mobile-store-manager/spec.md)                           | 2026-11-12 | 本地 Promote 与接力线归档提交（见 git log）                |
| FW-030 | [AI 逐条审核](work/FW-030-ai-review/spec.md)                                       | 2026-11-18 | FW-030～FW-038 接力线 Promote 与归档提交（见 git log）     |
| FW-031 | [管理员审核与改判（Web）](work/FW-031-admin-review-web/spec.md)                   | 2026-11-18 | FW-030～FW-038 接力线 Promote 与归档提交（见 git log）     |
| FW-032 | [今日视图与看板（Web）](work/FW-032-dashboard-web/spec.md)                        | 2026-11-18 | FW-030～FW-038 接力线 Promote 与归档提交（见 git log）     |
| FW-033 | [Mobile 管理端（一）：配置](work/FW-033-mobile-admin-config/spec.md)              | 2026-11-18 | FW-030～FW-038 接力线 Promote 与归档提交（见 git log）     |
| FW-034 | [Mobile 管理端（二）：审核与看板](work/FW-034-mobile-admin-review/spec.md)        | 2026-11-18 | FW-030～FW-038 接力线 Promote 与归档提交（见 git log）     |
| FW-035 | [个人中心（两端）](work/FW-035-profile/spec.md)                                   | 2026-11-18 | FW-030～FW-038 接力线 Promote 与归档提交（见 git log）     |
| FW-036 | [站内通知（后端 + Web 收件箱）](work/FW-036-notifications-backend/spec.md)        | 2026-11-17 | 本地 Promote 与接力线归档提交（见 git log）                |
| FW-037 | [站内通知（Mobile 收件箱与角标）](work/FW-037-notifications-mobile/spec.md)       | 2026-11-18 | FW-030～FW-038 接力线 Promote 与归档提交（见 git log）     |
| FW-038 | [AI 真模型验收与提示词调优](work/FW-038-ai-real-model-acceptance/spec.md)         | 2026-11-18 | FW-030～FW-038 接力线 Promote 与归档提交（见 git log）     |
| FW-039 | [真实邮件验收](work/FW-039-real-email-acceptance/spec.md)                          | 2026-11-19 | 真实注册与找回验收、Promote、额度修正、审查及归档提交（见 git log） |
| FW-040 | [Web 窄屏适配](work/FW-040-web-narrow-viewport/spec.md)                            | 2026-11-19 | `e4bdb40` 实现提交；归档提交（见 git log）                    |
| FW-041 | [Web 控制台视觉基础（阶段一）](work/FW-041-web-visual-foundation/spec.md)             | 2026-11-20 | Promote 与归档提交（见 git log）                              |
| FW-042 | [Web 控制台剩余页面布局整理](work/FW-042-web-console-pages/spec.md) | 2026-11-20 | 实现、Promote 与归档提交（见 git log） |
| FW-043 | [Web 控制台剩余页面布局整理（二）](work/FW-043-web-remaining-pages/spec.md) | 2026-11-20 | 实现、方式 A 验收、Promote 与归档提交（见 git log） |
| FW-044 | [Web 品牌与点缀](work/FW-044-web-brand-accents/spec.md) | 2026-11-22 | 实现、方式 A 验收、Promote 与归档提交（见 git log） |
