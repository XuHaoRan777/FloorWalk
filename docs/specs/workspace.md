# 工程骨架

## 包边界与启动

pnpm workspace 包含 `@apps/api`、`@apps/web`、`@apps/mobile` 和 `@libs/shared`，共用根锁文件。API 使用 NestJS，独立 Web 使用 shadcn-admin，Mobile 使用 Expo / React Native 与 gluestack-ui；Web 与 Mobile 不共享 UI。

根入口先构建 shared，再启动应用；统一开发入口同时启动 shared watch 与三个应用，任一进程退出会结束同组。shared watch 保留上次构建产物，避免统一启动时消费者先于新产物启动。独立入口、端口、依赖版本及验证命令见 [开发环境](../context/dev-environment.md)，安装、环境文件与进程操作见 [本地开发说明](../howto/local-development.md)。三应用各用开发与生产环境文件，实际文件不提交；Mobile 生产构建只导出 JS bundle，不启动服务。

业务源文件由 ESLint `max-lines` 检查 400 行上限，不计空行和注释；测试、`components/ui/` 和 `packages/shared/src/contract/` 豁免。

## shared 消费

shared 导出运行时常量 `APP_NAME = 'FloorWalk'` 以及巡检主链 zod 契约，提供 ESM、CommonJS 和声明文件。API 启动日志、Web 页面、Mobile 首页通过包名实际引用它，不跨包相对引用源码。shared 不含 React、React Native、NestJS 或 UI 依赖；watch 重新生成产物，消费者可重新载入。

## API 进程探针

`GET /health` 返回 HTTP 200 和 `{"status":"ok"}`。登录校验当前用户，受保护请求读取数据库中的当前角色与门店绑定；巡检、审核队列、证据链接和看板业务见[巡检主链](inspection.md)，聊天与管理见[聊天](chat.md)、[管理](admin.md)。邮件驱动由 `MAIL_DRIVER` 选择，支持测试假驱动和 Resend 模板驱动；Resend 使用 `verification-code` 模板，配置键为 `MAIL_FROM_ADDRESS`、`RESEND_API_KEY`、`RESEND_TEMPLATE_ID`，验证码过期变量 `EXPIRES_IN` 固定为「5 分钟」。API 监听 `HOST`（缺省 `127.0.0.1`），启动日志输出 shared 项目名及监听地址；PORT 必须为 1—65535 的整数。API 进程共用一个数据库连接池，应用关闭时释放。

AI 审核由 `AI_REVIEW_DRIVER` 选择 `fake` 或 `openai`，缺省为 `fake`。假模型按输入条目的 `expectedConclusion` 返回固定结论，省略时沿用自评，不发外部请求。OpenAI 兼容驱动使用 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`；仅选用 `openai` 时要求 API Key 和模型名，未填 Base URL 时使用 SDK 默认地址，`fake` 时三者均可不填。各键的属性注释与模板位置见[开发环境](../context/dev-environment.md#配置)。逐条队列、结论与重试规则见[巡检主链](inspection.md#巡检规则)；图片压缩与签名链接读取见[开发环境](../context/dev-environment.md)。

## Web 页面壳

独立 Web 的 `/` 是公开首页占位；`/console` 为商家管理员显示任务审核队列与详情、门店看板和管理入口，登录与审核行为见 [Web 控制台](web-console.md)。两页可相互导航，支持直接访问和刷新，控制台侧边栏可开关。开发及构建后 preview 已验证，上游许可与来源见 [本地开发说明](../howto/local-development.md#上游来源)。

## 共享设计系统

Web 控制台与 Mobile 店长端统一使用 Framed sheet 视觉方向。颜色、字体、字号、间距、圆角与阴影的唯一来源为 [`packages/tokens/tokens.css`](../../packages/tokens/tokens.css)；Web Tailwind 主题和 Mobile NativeWind 主题从该文件消费。NativeWind 无法在 React Native 静态样式中直接解析的字号映射、圆角与间距由 `packages/tokens/generate-native.mjs` 生成 `packages/tokens/native.json`，不得手改生成文件；维护命令见[本地开发说明](../howto/local-development.md#设计-token)。

## Mobile 运行

店长可在 Expo Web 和 Mobile 应用中查看今日任务、读取任务详情、用相机逐项上传或重传、使用聊天并查看本店任务记录；行为见 [Mobile 店长巡检](mobile-inspector.md)。

根布局使用浅色主题。Provider 在原生端调用 Appearance，将 system 模式映射为 unspecified；在 Expo Web 端切换已有的根元素 light/dark 样式类，卸载时恢复，不调用缺失的原生主题设置方法。Expo Web 是移动应用预览，与独立 Web 应用不同。

开发默认使用 LAN 模式，同一局域网真机可用兼容 Expo SDK 的 Expo Go 扫码。2026-10-06 用户确认真机加载及首页按钮交互通过；2026-11-16 用户确认 SDK 58 升级后原生启动与页面显示正常，启动报错和白屏均已消失。Expo Web 主题修复已通过类型检查，尚无修复后的浏览器交互证据。

## 没有的

没有缓存、CI/CD、云部署、APK 签名或商店发布。聊天、门店和模板管理见[聊天](chat.md)与[管理](admin.md)，Mobile 历史记录见[店长巡检](mobile-inspector.md#记录)。Web 与 Mobile 使用服务端会话表和 HttpOnly cookie，不把 token 放进脚本可读存储。存储接口支持本地文件与阿里云 OSS，OSS 配置及切换方式见[开发环境](../context/dev-environment.md)。Web 生产构建与 preview 带 CSP，开发服务器不添加 CSP。

## 数据契约（归档时再生成）

| 入口             | 当前契约                                                                   | 代码（归档时再生成）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| workspace 与命令 | 四包编排和根检查入口                                                       | [package.json](../../package.json)、[pnpm-workspace.yaml](../../pnpm-workspace.yaml)                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| shared           | APP_NAME 与巡检主链 zod 契约                                               | [源码](../../packages/shared/src/index.ts)、[契约](../../packages/shared/src/contract/index.ts)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| API              | /health、会话、邮箱验证码注册/找回、账号、任务/巡检/证据/看板、聊天、模板/AI 标准、日程与记录接口 | [控制器](../../apps/api/src/controllers/health.controller.ts)、[认证接口](../../apps/api/src/controllers/auth.controller.ts)、[组织注册](../../apps/api/src/controllers/orgs.controller.ts)、[邮箱验证](../../apps/api/src/controllers/verification.controller.ts)、[密码找回](../../apps/api/src/controllers/password-recovery.controller.ts)、[账号](../../apps/api/src/controllers/users.controller.ts)、[巡检](../../apps/api/src/controllers/inspection.controller.ts)、[记录](../../apps/api/src/controllers/records.controller.ts)、[证据](../../apps/api/src/controllers/evidence.controller.ts)、[任务审核](../../apps/api/src/controllers/task-review.controller.ts)、[任务日程](../../apps/api/src/controllers/schedules.controller.ts)、[模板](../../apps/api/src/controllers/templates.controller.ts)、[AI 标准](../../apps/api/src/controllers/ai-standards.controller.ts)、[管理](../../apps/api/src/controllers/admin.controller.ts)、[连接池生命周期](../../apps/api/src/db/pool.provider.ts)、[启动](../../apps/api/src/main.ts) |
| Web              | /、/console、HttpOnly 登录会话、逐条审核/看板/聊天/管理/日程 API、生产 CSP | [路由](../../apps/web/src/router.tsx)、[客户端](../../apps/web/src/lib/api.ts)、[构建配置](../../apps/web/vite.config.ts)                                                                                                                                                                                                                                                                                                                                                                                                    |
| Mobile           | 登录、今日任务、任务详情、相机逐项上传/重传、聊天、记录列表与只读详情       | [导航](../../apps/mobile/app/_layout.tsx)、[屏幕](../../apps/mobile/components/mobile/)、[API](../../apps/mobile/lib/api.ts)、[功能客户端](../../apps/mobile/lib/api/)                                                                                                                                                                                                                                                                                                                                                       |
| 共享设计系统     | 两端主题及原生字体、尺寸映射                                               | [CSS token 源](../../packages/tokens/tokens.css)、[Native 生成器](../../packages/tokens/generate-native.mjs)、[Native 映射](../../packages/tokens/native.json)                                                                                                                                                                                                                                                                                                                                                               |

## 修订记录

| 日期       | 用户或调用方可观察的变化                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-06 | 建立三应用与 shared 可运行骨架：健康探针、公开首页与控制台演示壳、真机首页与按钮反馈；修复 Expo Web 主题初始化调用并支持 LAN 扫码。                         |
| 2026-10-24 | 建立巡检主链契约、PostgreSQL 迁移与 Northbean 种子；API 提供登录、角色校验及固定数据骨架接口，Mobile Expo Web 具备 Playwright 取证入口。                    |
| 2026-10-24 | FW-003 完成 `/api` 契约接口、统一错误与 CORS；当时按 SDK 57 对齐依赖，Mobile Expo Web 与三端 CORS 有独立 e2e 验证。                                                |
| 2026-10-25 | FW-005、FW-006 将 Mobile 首页和 Web 控制台壳替换为巡检、审核与总部看板流程。                                                                                |
| 2026-10-25 | FW-007 集成并归档 g01：API、Mobile、Web 与跨端演示链在真实接口上闭环通过。                                                                                  |
| 2026-10-26 | FW-008 拆分 API/Web/Mobile 功能模块，Mobile 改用 Tabs 导航；业务源码 400 行上限纳入 lint。                                                                  |
| 2026-10-27 | FW-009 三端改用 HttpOnly 服务端会话；Web 生产构建和 preview 增加 CSP。                                                                                      |
| 2026-10-28 | FW-010 API 进程共用一个数据库连接池，应用关闭时释放；接口行为不变。                                                                                         |
| 2026-10-29 | g02 集成聊天、门店与模板管理和 Mobile 记录页；真实跨端演示链及 Android 原生相册回归通过。                                                                   |
| 2026-11-03 | FW-016 统一 Web 与 Mobile 的 Framed sheet 设计系统；共享 token 驱动主题与原生字体、间距、圆角映射，完成登录、巡检、审核、门店、模板、记录与看板的统一样式。 |
| 2026-11-03 | g03 接入商家注册、商家/账号/主管范围、7 天会话续期、OSS 与 OpenAI 兼容审核适配器；统一开发入口保留 shared 构建产物。                                        |
| 2026-11-11 | FW-024～FW-029 完成两层角色、邮箱验证码、模板与日程配置、按任务审核及 Mobile 店长逐项巡检。                                                                 |
| 2026-11-12 | Mobile 升级至 Expo SDK 58（Expo 58.0.24、Router 58.0.31、React 19.3.0、React Native 0.88.1），补齐 SDK 58 类型兼容，并修复 NativeWind 包装层缺少 NativeComponentRegistry、AssetRegistry 导致的原生启动错误与白屏；2026-11-16 用户确认原生真机复测通过，未采集设备系统版本。 |
| 2026-11-17 | FW-030 以 `AI_REVIEW_DRIVER` 选择逐条审核驱动；默认假模型无外部请求，OpenAI 凭据和模型名仅在启用兼容驱动时必填。 |
