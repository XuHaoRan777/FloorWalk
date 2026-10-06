# Monorepo 骨架与各模块启动

> ID：`FW-001`
>
> 状态：`draft`

## 目标

开发者可以从 FloorWalk 根目录安装依赖、执行检查，并启动 API、Web 和 Mobile。
shared 可以构建、监听源码变化，并被三个应用通过 workspace 包实际引用。
本轮交付可继续开发的工程骨架；工作模式为建设模式，验收方式为 B Agent 验收。

## 非目标

- 登录、注册、角色权限、真实会话、Clerk 或其他认证服务；Web 控制台在本轮是明确标识的未接入认证的演示壳，不处理受保护数据。
- 门店、模板、巡检、审核、聊天、得分看板及种子数据等业务实现。
- 宣传页的正式视觉设计、营销内容和完整控制台示例页面。
- 数据库、ORM、Redis、容器、上传存储、CI/CD、云部署、付费服务或应用商店发布。
- 从旧 Gift2CashApp 仓库复制模块；跨 Web / Mobile 共享 UI；单独创建 Admin 应用。

## 验收标准

以下 AC 是对用户“搭建 monorepo 骨架到每个模块都可以启动运行”的可执行细化，随本规格整体批准后生效；不是已经完成的事实。

- AC-01（`用户要求`）：工程包含 API、Web、Mobile、shared 四个 workspace 包和一份根锁文件；选型符合已确认的 NestJS 12、Expo / React Native、gluestack-ui v5、shadcn-admin。根目录安装成功，`pnpm install --frozen-lockfile` 成功且不改锁文件；记录精确工具版本和所用 shadcn-admin commit。应用不得依赖未声明的根目录运行时包。
- AC-02（`用户要求`）：shared 通过 `@libs/shared` 导出最小运行时常量 `APP_NAME = 'FloorWalk'` 和对应声明文件；构建与 watch 均可用。API 的启动日志、Web 与 Mobile 的骨架页实际消费此常量；不使用跨包相对路径直连源码，不向 shared 引入 React、React Native、NestJS 或 UI 依赖。通过正常修改再恢复常量，证明 watch 更新后消费者能取得新产物；不要求所有平台无刷新热更新。
- AC-03（`用户要求`）：NestJS 12 API 的开发模式与构建产物均可启动；`GET /health` 返回 HTTP 200 和 JSON `{"status":"ok"}`。该接口仅说明进程可响应，不探测数据库或认证；本轮无其他业务 API。
- AC-04（`用户要求`）：一个基于 shadcn-admin 的 Web 应用提供公开首页 `/` 与控制台演示壳 `/console`；前者不带后台侧边栏，后者使用模板控制台布局并明确标注“演示骨架，尚未接入登录”。Agent 在浏览器验证两页可见、导航可用、直接访问和刷新均成功；构建后的 preview 同样可访问。无模拟登录成功、真实用户数据或 Clerk 调用；保留所用上游代码的 MIT 许可声明。
- AC-05（`用户要求`）：Mobile 使用较新的稳定 Expo SDK 及其匹配的 React Native / React，接入 gluestack-ui v5；应用能由 Agent 启动并验证 shared 和 UI 组件实际可用。具体运行平台和交互判据采用下方待批准的验收细化，用户原始要求未指定 Android 或 iOS。
- AC-06（`用户要求`）：根目录提供独立启动 API / Web / Mobile / shared watch 的命令，以及先准备 shared 后启动开发进程的统一入口；提供根类型检查、lint、格式检查、构建入口。根构建涵盖 shared、API、Web 和 Mobile 所选平台的 JS bundle。验证各应用能同时启动、端口无冲突，并记录工作目录、进程和端口；结束后仅清理本任务启动的资源。启动步骤不依赖真实凭据、数据库或付费服务。

## 验收方式

`B Agent 验收`

用户已明确指定 B；具体平台和运行判据随本草案批准后生效，不把平台选择归为用户原始要求，不额外设置人工验收门。

| 你要求的（进入 spec） | 我建议补充的（待明确采纳，默认不生效） |
| --- | --- |
| Mobile 使用指定技术栈，可启动运行，由 Agent 验收 | 本轮选择 Android 模拟器或已连接设备：页面显示 shared 项目名与 gluestack 按钮，点击后看到本地反馈；Expo 配套检查、类型检查及 Android JS bundle 导出通过。只有 Metro、二维码或 Expo Web 不算原生运行通过。不验证 iOS，不要求发布 APK、签名或云构建。未确定平台与判据，Agent 就无法客观判断 Mobile 的运行验收是否完成。 |

下列 Android 阻塞处理及 plan 中相应检查以该建议被明确采纳为前提；采纳后将本项记为「建议采纳」。

没有 Android 可执行环境时，AC-05 标 `blocked` 并报告具体缺口；不降低标准，不把 Expo Web 代替原生验收，也不未经用户决定改成 A。其他不依赖原生设备的工作可以继续。

每条 AC 汇总一行证据。完整类型检查、lint、格式检查、构建及运行验收在 T06 统一收口；最终独立代码审查单独记录。过程失败保留原因和修复结论；不重复跑无关验证。

## 实现方案（待随规格批准）

已确认的框架及版本调查以 [技术基线](../../context/dev-environment.md) 为准。以下是本单元的候选实现选择，尚未标为建议采纳，也未安装：

| 范围 | 候选实现 | 对应验收 |
| --- | --- | --- |
| 根工程 | Node 24 LTS；优先使用本机 Node `24.19.0`、pnpm `11.21.0`，核验兼容后锁定；pnpm workspace，不引入 Nx / Turborepo | AC-01、AC-06 |
| 包布局 | `apps/api` → `@apps/api`；`apps/web` → `@apps/web`；`apps/mobile` → `@apps/mobile`；`packages/shared` → `@libs/shared` | AC-01、AC-02 |
| API | NestJS 12 + Express；包含框架所需 reflect-metadata、rxjs；保持同系列 Nest 包兼容 | AC-03 |
| Mobile | 优先验证技术基线中的 Expo SDK 57 配套组合；Expo Router、gluestack v5 与其匹配的样式/原生依赖按官方接入要求选定，不逐个追 latest | AC-05 |
| Web | 使用固定 commit 的 shadcn-admin，保留 React / Vite / TanStack Router / shadcn 基础和所需布局；裁剪无关演示、模拟登录和外部认证集成 | AC-04 |
| shared | TypeScript + tsup，生成包入口和声明；根据 API / Vite / Metro 的实际解析需要配置 exports，不预建领域模型 | AC-02 |
| 工具链 | TypeScript 选择各框架支持版本；ESLint + Prettier，采用项目既定缩进、引号、分号、尾逗号规则；不以根 overrides 强迫移动端使用不匹配的 React | AC-01、AC-06 |
| 本地命令 | 根 `dev`、`dev:api`、`dev:web`、`dev:mobile`、`dev:shared`、`typecheck`、`lint`、`format:check`、`build`；各包保留实际框架命令 | AC-06 |

配置只服务上述 AC。若候选版本无法兼容，先记录失败与替代组合；不擅自切换 NestJS 大版本、gluestack 大版本、UI 框架或验收平台。

## 涉及的当前事实

- [当前事实索引](../../specs/README.md)「索引」「当前没有业务代码」：实现验证后登记工程骨架事实，区分已有工程与尚无业务功能。
- 拟新增 `docs/specs/workspace.md`，归档 Promote 时生成；小节为「包边界与启动」「shared 消费」「API 进程探针」「Web 页面壳」「Mobile 运行」「没有的」「数据契约（归档时再生成）」「修订记录」。该文件当前不存在，通过上面的索引进入，避免预先把设计写成当前事实。
- 配套更新 [开发环境](../../context/dev-environment.md) 的环境、基础依赖、验证命令、已知偏差与工作流配套；新增 `docs/howto/local-development.md` 记录经验证的启动与验收步骤，并在 howto 索引及 AGENTS 触发表登记。

## 依赖

- 无。

## 批准记录

- 2026-10-06 开单与编排依据：用户原话“现在编排任务，从搭建monorepo骨架到每个模块都可以启动运行，建设模式，验收方式B Agent 验收”。已授权创建本单元文档并确定建设模式 / B 验收。
- 技术方向依据：用户已明确 API 为 NestJS 12、Mobile 为 React Native + Expo + gluestack-ui v5、Web 为 shadcn-admin，并讨论了合并首页与控制台。
- 规格批准：待用户审阅本文件的具体 AC、候选实现与范围；尚未授权按这份草案实施代码。
- 特殊授权：编排不包含 Git 提交、推送、发布、全局工具替换或系统级 Android 环境安装。项目目前没有 Git 工作树；若执行时仍如此，初始化和提交授权需单独解决，不能假报归档门通过。
