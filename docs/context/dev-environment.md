# 开发环境与验证入口

本文件只记录环境事实和命令。规则在 [`../../AGENTS.md`](../../AGENTS.md)，操作步骤在 [本地启动与骨架验收](../howto/local-development.md)。

## 环境

- 已建立 pnpm workspace：`apps/api`、`apps/web`、`apps/mobile`、`packages/shared`；只有工程骨架，没有门店巡检业务实现。
- 本轮实测 Node `24.19.0`、pnpm `11.21.0`；根 packageManager 锁定 pnpm，`.node-version` 记录 Node。TypeScript：API/Web/shared `5.9.3`，Mobile 按 Expo 配套使用 `6.0.3`。
- 本地 API `127.0.0.1:3018`；Web dev `127.0.0.1:3019`；Web preview `127.0.0.1:3019`（与 dev 择一启动）；Metro 默认 LAN 模式、端口 `3020`，供同一局域网真机扫码。2026-10-06 用户已确认同一 Wi-Fi 真机 Expo Go 加载成功。
- 没有数据库、缓存、容器或部署环境。后续数据库 schema 名仍预定 `floorwalk`，本轮未创建。
- 只读参考仓库：`F:\react_project\Gift2CashApp`；本轮未读取或复制其源码。

## 环境配置

- API、Web、Mobile 各自使用 `.env.development` 与 `.env.production`，实际文件被 Git 忽略，配套 `.example` 模板可提交。初始化步骤、加载优先级和变量边界见 [本地开发说明](../howto/local-development.md#环境文件与生效时机)。
- API 以 Node 原生 env-file 在 dev/start 时加载，端口来自 PORT；Web 通过 Vite mode/loadEnv 分别加载开发与生产配置，dev/preview 端口来自 PORT；Mobile 通过 Node env-file 预加载，开发端口使用 Expo 内置 RCT_METRO_PORT，生产配置用于 bundle 导出。
- 2026-10-06 本机验证：三端类型检查通过；API/Web 构建成功；开发端口 3018/3019/3020 的 HTTP/Metro 检查通过；API 生产启动 3018、Web preview 3019 通过。Mobile 生产导出单 worker 成功；2026-10-06 用户确认真机首页与体验按钮交互通过，设备操作系统未记录。Agent 验证时启动的测试服务已清理，用户自启进程不作清理。

## 基础依赖选型

以下为已安装版本；锁文件固定全部传递依赖，不能把安装成功当作原生运行通过。

| 模块 | 当前组合 | 验证边界 |
| --- | --- | --- |
| API | NestJS core/common/platform-express `12.1.2`、CLI `12.0.8`，ESM + Express | 开发与构建入口启动，GET /health 返回 200 和 status=ok |
| Web | shadcn-admin `2.2.1`；React/DOM `19.2.5`；Vite `8.0.8`；TanStack Router `1.168.22`；Tailwind `4.2.2` | 两页开发及 preview 浏览器运行、直接访问与刷新通过；无登录与业务数据 |
| Mobile | Expo `57.0.26`、Router `57.0.24`、React `19.2.3`、RN `0.86.3` | 类型检查、Expo 配套检查、Android Hermes bundle 成功；用户 Expo Go 真机验收通过，未记录设备系统 |
| Mobile UI | gluestack core `5.0.15` / utils `5.0.6`；NativeWind `5.0.0-preview.4`、react-native-css `3.0.7` | Provider、Button、theme 接入；预览版样式层按官方 v5 文档锁定，不能以 CLI 安装代替组件运行 |
| shared | tsup `8.5.1` | APP_NAME，ESM/CJS/声明、watch 与正常修改恢复通过；Mobile 首页由用户真机确认 |
| 根检查 | ESLint `10.12.0`、typescript-eslint `8.58.2`、Prettier `3.9.9`、concurrently `10.0.5` | 类型、lint、格式检查通过；统一启动与资源清理通过 |

Web 固定源码 commit `e16c87f213a5ba5e45964e9b67c792105ec74d26`，gluestack 固定源码 commit `b712c8541c85d57becbd1a1b2ba150a369223eb6`。原始来源与许可证说明见 [本地开发说明](../howto/local-development.md#上游来源)。没有从旧仓库拷贝模块。

版本依据：[NestJS npm 元数据](https://registry.npmjs.org/@nestjs%2Fcore/12.1.2)、[Expo 配套依赖](https://unpkg.com/expo@57.0.26/bundledNativeModules.json)、实际 `expo install --check`、[gluestack-ui 官方源码](https://github.com/gluestack/gluestack-ui/tree/b712c8541c85d57becbd1a1b2ba150a369223eb6)。根只放检查/编排工具，应用直接声明自身运行时依赖；不以根 overrides 强迫两端共用 React。

## 验证命令

| 范围 | 命令 |
| --- | --- |
| 安装 | `pnpm install --frozen-lockfile`；`pnpm peers check` |
| 全量类型 | `pnpm typecheck`，先生成 shared |
| 单模块类型 | `pnpm --filter @apps/api typecheck`；Web/Mobile/shared 换相应包名；先保证 shared 已构建 |
| lint / 格式 | `pnpm lint`；`pnpm format:check` |
| 根构建 | `pnpm build`：shared → API / Mobile Android bundle / Web |
| Mobile 配套 | `pnpm --filter @apps/mobile check` |
| 统一开发 | `pnpm dev`，shared 构建后启动四个进程；停止一组用 Ctrl+C |
| 独立开发 | `pnpm dev:api`、`pnpm dev:web`、`pnpm dev:mobile`、`pnpm dev:shared` |
| 文档 | `python scripts/validate_docs.py`；满足归档前提时 `--archive-gate`；改校验器后 `python -m unittest scripts.tests.test_validate_docs` |

本轮未新建测试框架，使用框架命令、HTTP、浏览器和原生判据。构建成功与 Metro 可响应不等于 Android 原生验收完成。

## 已知偏差

- Mobile 生产导出曾在资源输出阶段以 0xC0000005 退出；单 worker 重试成功，构建命令固定 `--max-workers 1`。根因尚未确认，未修改依赖；真机交互结论来自单独的用户验收。


- Android SDK / adb / emulator / AVD 在 PATH、环境变量和常见目录中未定位；没有已运行 adb server 可确认设备。Java `21.0.6` 可用。用户已通过 LAN Expo Go 完成真机验收，此工具缺口不再阻塞骨架归档；系统级环境安装仍须另获授权。
- 原 B 验收的机器门已完成，原生执行由用户明确真机确认并授权收尾；未采集手机系统版本，不声称双平台通过。当前事实见 [工程骨架](../specs/workspace.md)。
- pnpm 11 默认拦截 esbuild 安装脚本，workspace 仅显式允许 esbuild。
- Windows package script 不使用单引号包裹 pnpm filter；当前使用 `@apps/*` 包名筛选，避免未匹配任何包仍退出 0。
- NativeWind/Expo 首次运行会调整 Mobile tsconfig include；当前配置保留实际生成结果。
- gluestack 上游 README 声明 MIT，但固定 commit 根 LICENSE URL 返回 404；NOTICE 保留实际来源声明，未冒充不存在的许可文件。

## 工作流配套

- 上游模板：`F:\project\workflow\template`；同步日期：2026-10-06。项目协议中的授权与产品边界保留为本地配置。
- 本地适配：上下文压缩后落盘并继续；testlog 阈值按校验器使用“超过 5 条 / 超过 2 天”；长期事实不链接工作单元快照。
- Git 工作树已存在，执行起点 HEAD `1778848`，起始工作区干净，已配置 origin；用户于 2026-10-06 确认真机验收并授权当前单元归档、提交与推送。
- `scripts/hooks/commit-msg` 已提供，本轮未修改 hooksPath；它只检查 Mode: fix 的代码提交是否同时暂存 testlog，不检查是否真正追加记录。启用须按用户授权办理。
