# 工程骨架

## 包边界与启动

pnpm workspace 包含 `@apps/api`、`@apps/web`、`@apps/mobile` 和 `@libs/shared`，共用根锁文件。API 使用 NestJS，独立 Web 使用 shadcn-admin，Mobile 使用 Expo / React Native 与 gluestack-ui；Web 与 Mobile 不共享 UI。

根入口先构建 shared，再启动应用；统一开发入口同时启动 shared watch 与三个应用，任一进程退出会结束同组。独立入口、端口、依赖版本及验证命令见 [开发环境](../context/dev-environment.md)，安装、环境文件与进程操作见 [本地开发说明](../howto/local-development.md)。三应用各用开发与生产环境文件，实际文件不提交；Mobile 生产构建只导出 JS bundle，不启动服务。

## shared 消费

shared 仅导出运行时常量 `APP_NAME = 'FloorWalk'`，提供 ESM、CommonJS 和声明文件。API 启动日志、Web 页面、Mobile 首页通过包名实际引用它，不跨包相对引用源码。shared 不含 React、React Native、NestJS 或 UI 依赖；watch 重新生成产物，消费者可重新载入。

## API 进程探针

`GET /health` 返回 HTTP 200 和 `{"status":"ok"}`。它只说明进程可响应，不探测数据库或认证。API 绑定本机回环地址，启动日志输出 shared 项目名及监听地址；PORT 必须为 1—65535 的整数。

## Web 页面壳

独立 Web 的 `/` 是公开首页占位，不含后台侧边栏；`/console` 是基于上游布局的演示壳，明确显示“演示骨架，尚未接入登录”。两页可相互导航，支持直接访问和刷新，控制台侧边栏可开关。开发及构建后 preview 已验证，上游许可与来源见 [本地开发说明](../howto/local-development.md#上游来源)。

## Mobile 运行

Expo Router 首页显示 shared 项目名、工程演示说明和 gluestack“体验按钮”。点击后显示“按钮响应成功”，状态仅在当前组件内存中，不提交业务数据。

根布局使用浅色主题。Provider 在原生端调用 Appearance，将 system 模式映射为 unspecified；在 Expo Web 端切换已有的根元素 light/dark 样式类，卸载时恢复，不调用缺失的原生主题设置方法。Expo Web 是移动应用预览，与独立 Web 应用不同。

开发默认使用 LAN 模式，同一局域网真机可用兼容 Expo SDK 的 Expo Go 扫码。2026-10-06 用户确认真机加载及首页按钮交互通过；类型、Expo 配套与 Android Hermes bundle 已通过机器检查。真机证据来自用户反馈，未采集设备系统版本；不据此声称 Android/iOS 双平台均已验证。Expo Web 主题修复已通过类型检查，尚无修复后的浏览器交互证据。

## 没有的

没有登录、角色权限、业务 API、门店或检查模板、巡检提交与审核、聊天、得分看板、种子数据。没有数据库、上传存储、缓存、CI/CD、云部署、APK 签名或商店发布。工程骨架可启动不等于业务功能可用。

## 数据契约（归档时再生成）

| 入口 | 当前契约 | 代码（归档时再生成） |
| --- | --- | --- |
| workspace 与命令 | 四包编排和根检查入口 | [package.json](../../package.json)、[pnpm-workspace.yaml](../../pnpm-workspace.yaml) |
| shared | APP_NAME 常量及 import/require 声明入口 | [源码](../../packages/shared/src/index.ts)、[包入口](../../packages/shared/package.json) |
| API | GET /health，固定 status=ok；无请求体 | [控制器](../../apps/api/src/health.controller.ts)、[启动](../../apps/api/src/main.ts) |
| Web | /、/console；无登录或业务数据契约 | [路由](../../apps/web/src/router.tsx) |
| Mobile | 首页按钮设置本地反馈状态；无网络或持久化契约 | [首页](../../apps/mobile/app/index.tsx)、[布局](../../apps/mobile/app/_layout.tsx)、[Provider](../../apps/mobile/components/ui/gluestack-ui-provider/index.tsx) |

## 修订记录

| 日期 | 用户或调用方可观察的变化 |
| --- | --- |
| 2026-10-06 | 建立三应用与 shared 可运行骨架：健康探针、公开首页与控制台演示壳、真机首页与按钮反馈；修复 Expo Web 主题初始化调用并支持 LAN 扫码。 |
