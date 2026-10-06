# 本地启动与骨架验收

本轮不需要数据库、真实凭据或付费服务。版本与验证结果见 [开发环境](../context/dev-environment.md)。

## 安装和检查

在仓库根目录使用 Node 24.19.0、pnpm 11.21.0。首次检出时，先从各模块的模板创建环境文件（只创建缺失文件，不覆盖已有配置）：

```powershell
foreach ($app in 'api', 'web', 'mobile') {
  foreach ($mode in 'development', 'production') {
    $envPath = "apps/$app/.env.$mode"
    if (-not (Test-Path -LiteralPath $envPath)) {
      Copy-Item -LiteralPath "$envPath.example" -Destination $envPath
    }
  }
}
```

本机这六份实际环境文件已创建。模板只包含本轮所需的非敏感默认配置；实际文件不提交到 Git。

然后安装并检查：

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

根构建先生成 shared，再构建 API、Android JS bundle 和 Web；Android JS bundle 不是 APK，不代表原生交互已验收。首次安装仅允许 esbuild 的安装脚本。

## 环境文件与生效时机

每个应用在自己的目录维护 `.env.development`、`.env.production`，对应 `.example` 模板可提交；根目录不集中存放三端配置。现有命令无需新增参数：

| 模块 / 命令 | 加载与用途 | 当前默认配置 |
| --- | --- | --- |
| API `dev` | Node `--env-file=.env.development` 预加载后运行 Nest watch；进程启动时读取 | `PORT` 为 3018，`NODE_ENV` 为 development |
| API `start` | Node `--env-file=.env.production` 启动构建产物；修改配置只需重启 | `PORT` 为 3018，`NODE_ENV` 为 production |
| Web `dev` | Vite `--mode development` 加载开发文件 | `PORT` 为 3019 |
| Web `build` / `preview` | Vite `--mode production` 加载生产文件；preview 端口由生产文件控制 | `PORT` 为 3019 |
| Mobile `dev` / `android` | Node 预加载开发文件，再运行 Expo；通过 Expo 内置变量配置 Metro | `RCT_METRO_PORT` 为 3020，`NODE_ENV` 为 development |
| Mobile `build` | Node 预加载生产文件，Expo 导出生产 Android JS bundle | `NODE_ENV` 为 production；没有生产监听端口 |

已存在的进程环境变量优先于文件。同名 `PORT` 应按应用注入，不要在根启动终端统一设置，否则 API 和 Web 会继承同一个端口。API 与 Web 的 PORT 缺失或不是有效端口会终止启动，不默默回退为另一端口。

API 只显式加载命令指定的那份文件，不自动合并 `.env.local`。Web 遵循 Vite 原生 `.env` / `.env.local` / 模式文件加载规则；Mobile 在 Node 预加载后仍遵循 Expo 的后续加载行为，已预加载的变量保留优先级。本项目提供的统一入口只要求上述两份模式文件，不依赖额外覆盖文件。

Web 的 `VITE_*`、Mobile 的 `EXPO_PUBLIC_*` 属于客户端公开变量，通常在构建时写入产物，不能放密钥。当前未接业务 API，不预建 API 地址等配置项。API 的配置在启动时生效；Web/Mobile 客户端配置修改后通常需要重新构建。环境文件修改后应重启对应开发命令，保证重新加载。

Web preview 只作本地构建预览，生产托管服务尚未建立；未来 Web 生产服务使用 3019 的部署要求已记录，不能把 preview 当成生产服务器。Mobile 正式 App 不启动 Metro，不配置生产服务端口。

Mobile 本机首次生产导出在资源输出阶段出现 Windows `0xC0000005`；单 worker 导出成功，构建命令已采用 `--max-workers 1`。这是已验证的规避方式，尚不能据此确认异常根因。

## 启动与端口

默认检查 3018、3019、3020 是否空闲；若修改环境文件，应检查修改后的端口。Web dev 与 preview 默认共用 3019，启动其中一个前先停止另一个。不要停止归属不明的进程。

```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 3018, 3019, 3020 }
pnpm dev
```

`pnpm dev` 先准备 shared，再启动 shared watch、API、Web、Metro；任一进程退出会结束同组进程，Ctrl+C 结束本组。独立入口：

| 根命令 | 工作目录 | 地址 / 用途 |
| --- | --- | --- |
| `pnpm dev:shared` | `packages/shared` | 监听并生成 ESM/CJS 与声明；不监听 HTTP 端口 |
| `pnpm dev:api` | `apps/api` | `http://127.0.0.1:3018/health` |
| `pnpm dev:web` | `apps/web` | `http://127.0.0.1:3019/` 与 `/console` |
| `pnpm dev:mobile` | `apps/mobile` | Metro，`localhost:3020`；需要另有 Android 执行环境 |

三个独立应用入口也会先构建 shared。直接执行包内命令时，先运行 `pnpm --filter @libs/shared build`。

构建后的 API：`pnpm --filter @apps/api start`，同样占用 3018，先结束开发 API。
构建后的 Web：`pnpm --filter @apps/web preview`，访问 `http://127.0.0.1:3019/` 与 `/console`。

## 运行判据

- API 开发及构建产物：`GET /health` 应为 HTTP 200，JSON 为 `{"status":"ok"}`；日志项目名来自 shared。它只证明进程可响应。
- Web 开发及 preview：首页不含后台侧边栏；点击“查看控制台演示”进入 `/console`，显示“演示骨架，尚未接入登录”。返回公开首页、直接输入两页 URL、刷新均能显示页面；控制台侧边栏可开关。
- shared watch：正常修改 `packages/shared/src/index.ts` 的 APP_NAME，观察 watch 重新输出；应用重新载入后应取得新值，结束后恢复 `FloorWalk`。不要求所有平台无刷新热更新。
- Android：已有 SDK/adb 和模拟器或已连接设备，且有支持 SDK 57 的 Expo Go 时，在 shared 构建后运行 `pnpm --filter @apps/mobile android`。若使用已连接设备与 localhost Metro，按设备连接情况配置 adb reverse 3020。预期页面可见 `FloorWalk`、有实际样式的 gluestack 按钮，点击“体验按钮”后出现“按钮响应成功”。预期画面为标题、按钮及反馈文本同屏可见。只有 Metro、二维码或 JS bundle 不满足原生判据。

当前 Android SDK/adb/模拟器入口未定位，不能照此说明宣称原生验收已通过。不要未经授权安装系统级 Android 环境。

## 上游来源

- Web：[shadcn-admin](https://github.com/satnaing/shadcn-admin/tree/e16c87f213a5ba5e45964e9b67c792105ec74d26)，commit `e16c87f213a5ba5e45964e9b67c792105ec74d26`，版本 2.2.1。保留必要布局与 Radix 组件，裁剪登录、业务示例、主题切换与持久化侧边栏偏好；MIT 全文在 `apps/web/LICENSE`。
- Mobile：[gluestack-ui starter](https://github.com/gluestack/gluestack-ui/tree/b712c8541c85d57becbd1a1b2ba150a369223eb6/apps/starter-kit-expo)，commit `b712c8541c85d57becbd1a1b2ba150a369223eb6`。使用 Provider、Button、theme；依赖按 Expo 57 配套。上游根 README 的 MIT / Copyright © 2026 GeekyAnts 声明保存在 `apps/mobile/NOTICE`；该 commit 根 LICENSE 链接返回 404，未把 CLI 的独立版权署名冒充组件许可证。
