# Monorepo 骨架与各模块启动 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`draft`
- 归档状态：`active`
- 当前任务：无，任务编排已完成，实施尚未开始
- 阻塞：规格待批准；Android 运行验证入口未定位；Git 工作树不存在且无提交授权，归档门暂不可通过
- 下一步：批准 spec 后从 T01 连续执行；运行环境缺口如实记录，不改验收方式

2026-10-06 Preflight：项目目前只有文档与工作流脚本；无业务数据、业务进程或新建包。读到本机 Node `24.19.0`、pnpm `11.21.0`。
PATH 中未找到 adb / emulator；本次查看的默认 Android SDK 与 AVD 目录未发现可用入口，不代表其他磁盘或已有设备一定不存在。T01 进一步定位，T05 才据实际能力判定原生验收是否受阻。
`git status --short` 退出 128，目录不是 Git 工作树；不得自动提交用户原有文件或通过忽略变更绕开归档门。

## 任务表

| ID | 任务 | 状态 | 依赖 | 验证方式 |
| --- | --- | --- | --- | --- |
| T01 | 核验并锁定兼容工具链，建立根 workspace、四个包清单与最小检查配置；定位 Android 运行环境和 Git 条件 | `pending` | 规格批准 | AC-01、AC-06：记录版本和上游 commit；包发现、依赖解析与安装；确认各任务环境缺口，不启动或修改归属不明的服务 |
| T02 | 建立 shared 的构建、watch、入口与声明文件 | `pending` | T01 | AC-02：构建及 watch 产物可导入；消费者的实际引用随 T03—T05 完成并在 T06 汇总 |
| T03 | 建立 NestJS 12 API，接入 shared 并提供进程探针 | `pending` | T02 | AC-03：模块类型检查；开发和构建入口、HTTP 响应的完整运行证据在 T06 收口 |
| T04 | 集成 shadcn-admin，建立宣传首页占位与控制台演示壳，接入 shared | `pending` | T02；执行顺序在 T03 后 | AC-04：受影响模块类型 / lint 检查；页面、导航、刷新和 preview 验证在 T06 收口；保留 MIT 声明 |
| T05 | 建立 Expo / React Native 应用，接入 gluestack v5、路由和 shared | `pending` | T02；执行顺序在 T04 后 | AC-05：Expo 版本匹配检查与模块类型检查；Android bundle 与设备运行在 T06 收口；环境不可用时记录 blocked，不以 Metro 或 Web 替代 |
| T06 | 完成统一启动命令、B 验收、资源清理和本地运行说明 | `pending` | T03、T04、T05 的所需实现；可先验证不受阻 AC | AC-01—AC-06：冻结安装、shared 正常修改 / 恢复、根检查和构建一次、API HTTP 响应、Web 浏览器、Android 原生交互和多进程协同；每条 AC 一行证据 |
| T07 | 最终代码审查 | `pending` | T06 全部 AC 通过 | 独立只读上下文读取 spec、plan、完整差异，按 AGENTS 七域逐项结论；修复归属原任务，仅复核 finding；未完成不得 verified 或归档 |

按上述顺序一次推进一个任务。独立调查可只读委派，局部实现同一时刻最多一个写入型代理；任何代理都不改本单元状态或 Backlog。T01—T05 只跑相应机器门，不安排任务级复审。

## 证据

此表先记录编排前检查，后续不把这些记录当作实现 AC 已通过。每条 AC 的最终结论在执行时新增一行；截图 / 日志按需放 `evidence/`，不包含凭据或用户数据。

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| 编排文档检查 | passed | `python scripts/validate_docs.py` | 文档校验输出 | 创建前、编排完成后均为 0 个问题；仅验证文档，不代表实施 AC 通过 |
| 环境调查 | passed | `node --version`；`pnpm --version` | 命令输出 | Node 24.19.0、pnpm 11.21.0；只确认安装事实，不代表候选框架组合通过 |
| 原生环境调查 | blocked | `Get-Command adb,emulator -ErrorAction SilentlyContinue`；检查默认 SDK / AVD 目录 | 命令输出 | 未定位运行入口；T01 进一步调查，不把此项视为依赖安装失败或 Android 不可用的最终结论 |
| 归档前提 | blocked | `git status --short` | 退出码 128 | 当前目录不是 Git 工作树；未初始化、未提交；归档前须解决 Git 与提交权限 |

## 决策与偏差

- 2026-10-06：用户要求先编排任务，采用建设模式、B Agent 验收；本轮只建立 spec / plan 和 Backlog 登记，不写业务代码、不安装依赖。
- 编排独立审阅：只读 Subagent 检查任务依赖、AC 可验证性、授权归因、B 验收及归档阻塞；发现 Android 平台并非用户原始要求，已从 AC-05 中分离为待明确采纳的验收细化。此为计划审阅，不替代 T07 最终代码审查。
- 当前七项实施任务为批准候选；批准后若新增任务数超过批准数一半，按协议停止扩大单元。
- shared 是库，不启动 HTTP 服务；验收为构建 / watch / 三应用实际消费。
- Web 控制台在本单元只验布局壳；真实登录和权限留给后续工作，不保留模板的模拟认证作为可用登录功能。
- Android 原生运行是候选平台细化，待规格批准；若缺 SDK、模拟器镜像或可用设备，报告具体缺口；系统级安装与外部服务按已有授权边界办理。
- 本单元不以新增整套测试框架为独立目标；优先使用所选框架自带命令、HTTP 客户端、已有浏览器与 Android 调试能力完成 B 验收，不临时搭建替代业务实例。
- 所有 AC 与 T07 通过后才标 verified；按 spec 指定位置 Promote 当前事实及运行说明。归档前必须通过 `python scripts/validate_docs.py --archive-gate` 且 `git status --short` 为空；没有提交授权时保留真实未归档状态并报告，不能用删除工作成果换取清洁工作树。
