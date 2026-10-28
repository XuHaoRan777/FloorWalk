# 工程骨架

## 包边界与启动

pnpm workspace 包含 `@apps/api`、`@apps/web`、`@apps/mobile` 和 `@libs/shared`，共用根锁文件。API 使用 NestJS，独立 Web 使用 shadcn-admin，Mobile 使用 Expo / React Native 与 gluestack-ui；Web 与 Mobile 不共享 UI。

根入口先构建 shared，再启动应用；统一开发入口同时启动 shared watch 与三个应用，任一进程退出会结束同组。独立入口、端口、依赖版本及验证命令见 [开发环境](../context/dev-environment.md)，安装、环境文件与进程操作见 [本地开发说明](../howto/local-development.md)。三应用各用开发与生产环境文件，实际文件不提交；Mobile 生产构建只导出 JS bundle，不启动服务。

业务源文件由 ESLint `max-lines` 检查 400 行上限，不计空行和注释；测试、`components/ui/` 和 `packages/shared/src/contract/` 豁免。

## shared 消费

shared 导出运行时常量 `APP_NAME = 'FloorWalk'` 以及巡检主链 zod 契约，提供 ESM、CommonJS 和声明文件。API 启动日志、Web 页面、Mobile 首页通过包名实际引用它，不跨包相对引用源码。shared 不含 React、React Native、NestJS 或 UI 依赖；watch 重新生成产物，消费者可重新载入。

## API 进程探针

`GET /health` 返回 HTTP 200 和 `{"status":"ok"}`。登录校验当前用户，受保护请求读取数据库中的当前角色与门店绑定；巡检、审核队列、证据链接和看板业务见[巡检主链](inspection.md)。API 监听 `HOST`（缺省 `127.0.0.1`），启动日志输出 shared 项目名及监听地址；PORT 必须为 1—65535 的整数。API 进程共用一个数据库连接池，应用关闭时释放。

## Web 页面壳

独立 Web 的 `/` 是公开首页占位；`/console` 按角色显示主管审核队列与详情，或总部只读看板，登录与审核行为见 [Web 控制台](web-console.md)。两页可相互导航，支持直接访问和刷新，控制台侧边栏可开关。开发及构建后 preview 已验证，上游许可与来源见 [本地开发说明](../howto/local-development.md#上游来源)。

## Mobile 运行

店员可在 Expo Web 和 Mobile 应用中登录、查看今日待巡、创建巡检、填写检查结果与备注、上传必拍照片、提交，以及补交主管打回的巡检；行为见 [Mobile 店员巡检](mobile-inspector.md)。

根布局使用浅色主题。Provider 在原生端调用 Appearance，将 system 模式映射为 unspecified；在 Expo Web 端切换已有的根元素 light/dark 样式类，卸载时恢复，不调用缺失的原生主题设置方法。Expo Web 是移动应用预览，与独立 Web 应用不同。

开发默认使用 LAN 模式，同一局域网真机可用兼容 Expo SDK 的 Expo Go 扫码。2026-10-06 用户确认真机加载及首页按钮交互通过；类型、Expo 配套与 Android Hermes bundle 已通过机器检查。真机证据来自用户反馈，未采集设备系统版本；不据此声称 Android/iOS 双平台均已验证。Expo Web 主题修复已通过类型检查，尚无修复后的浏览器交互证据。

## 没有的

没有聊天、用户/门店/模板管理页、缓存、CI/CD、云部署、APK 签名或商店发布。Web 与 Mobile 使用服务端会话表和 HttpOnly cookie，不把 token 放进脚本可读存储。Web 生产构建与 preview 带 CSP，开发服务器不添加 CSP。

## 数据契约（归档时再生成）

| 入口             | 当前契约                                        | 代码（归档时再生成）                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| workspace 与命令 | 四包编排和根检查入口                            | [package.json](../../package.json)、[pnpm-workspace.yaml](../../pnpm-workspace.yaml)                                                                                                                                                                                                                                                                                                                                                            |
| shared           | APP_NAME 与巡检主链 zod 契约                    | [源码](../../packages/shared/src/index.ts)、[契约](../../packages/shared/src/contract/index.ts)                                                                                                                                                                                                                                                                                                                                                 |
| API              | /health、会话登录/退出、/me、巡检/审核/证据/看板接口 | [控制器](../../apps/api/src/health.controller.ts)、[认证接口](../../apps/api/src/auth.controller.ts)、[巡检](../../apps/api/src/inspection.controller.ts)、[证据](../../apps/api/src/evidence.controller.ts)、[审核](../../apps/api/src/review.controller.ts)、[看板](../../apps/api/src/dashboard.controller.ts)、[共用查询](../../apps/api/src/inspection-queries.ts)、[认证](../../apps/api/src/auth.ts)、[连接池生命周期](../../apps/api/src/db/pool.provider.ts)、[启动](../../apps/api/src/main.ts) |
| Web              | /、/console、HttpOnly 登录会话、审核/看板 API、生产 CSP | [路由](../../apps/web/src/router.tsx)、[客户端](../../apps/web/src/lib/api.ts)、[构建配置](../../apps/web/vite.config.ts) |
| Mobile           | 登录、今日巡检、巡检详情、检查项与证据上传      | [导航](../../apps/mobile/app/_layout.tsx)、[屏幕](../../apps/mobile/components/mobile/)、[API](../../apps/mobile/lib/api.ts)、[功能客户端](../../apps/mobile/lib/api/)                                                                                                                                                                                                                                                                          |

## 修订记录

| 日期       | 用户或调用方可观察的变化                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-06 | 建立三应用与 shared 可运行骨架：健康探针、公开首页与控制台演示壳、真机首页与按钮反馈；修复 Expo Web 主题初始化调用并支持 LAN 扫码。      |
| 2026-10-24 | 建立巡检主链契约、PostgreSQL 迁移与 Northbean 种子；API 提供登录、角色校验及固定数据骨架接口，Mobile Expo Web 具备 Playwright 取证入口。 |
| 2026-10-24 | FW-003 完成 `/api` 契约接口、统一错误与 CORS；SDK 57 依赖对齐，Mobile Expo Web 与三端 CORS 有独立 e2e 验证。                             |
| 2026-10-25 | FW-005、FW-006 将 Mobile 首页和 Web 控制台壳替换为巡检、审核与总部看板流程。                                                             |
| 2026-10-25 | FW-007 集成并归档 g01：API、Mobile、Web 与跨端演示链在真实接口上闭环通过。                                                               |
| 2026-10-26 | FW-008 拆分 API/Web/Mobile 功能模块，Mobile 改用 Tabs 导航；业务源码 400 行上限纳入 lint。                                               |
| 2026-10-27 | FW-009 三端改用 HttpOnly 服务端会话；Web 生产构建和 preview 增加 CSP。                                                                   |
