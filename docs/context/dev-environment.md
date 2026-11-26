# 开发环境与验证入口

本文件只记录环境事实和命令。规则在 [`../../AGENTS.md`](../../AGENTS.md)，操作步骤在 [本地启动与骨架验收](../howto/local-development.md)。

## 环境

- 已建立 pnpm workspace：`apps/api`、`apps/web`、`apps/mobile`、`packages/shared`；FW-003 已完成巡检主链契约、数据库种子和 API 契约接口，提交锁分与审核业务规则由并行单元 FW-004 实现。
- 本轮实测 Node `24.19.0`、pnpm `11.21.0`；根 packageManager 锁定 pnpm，`.node-version` 记录 Node。TypeScript：API/Web/shared `5.9.3`，Mobile 按 Expo 配套使用 `6.0.3`。
- 本地 API 端口 `3018`；Web dev `127.0.0.1:3019`；Web preview `127.0.0.1:3019`（与 dev 择一启动）；Metro 默认 LAN 模式、端口 `3020`，供同一局域网真机扫码。`pnpm dev` 下 API 监听所有网卡，Mobile 使用 Expo Metro 主机名访问 API，供同一 Wi-Fi 真机使用；e2e 槽位仍使用 loopback。
- 数据库：本机 Docker 容器 `local-pg18`（PostgreSQL 18），宿主端口 `5433`；角色 `floorwalk`（非超级用户，不能建库），库 `floorwalk`（开发）和 `floorwalk_e2e_1`～`floorwalk_e2e_3`（e2e 槽位，见 [并行组](../howto/parallel.md)）。schema `floorwalk` 由版本化迁移建立，含组织、门店、账号、主管指派及巡检业务表，可由种子重建。无邮件服务或部署环境。
- 开发 Agent：Codex 桌面版，权限用完全访问（2026-10-23 用户决定），没有沙箱，边界见 [`AGENTS.md`](../../AGENTS.md) 第 12 节。并行单元的对话工作位置选「新建本地工作树」，Codex 建工作树时按 [`.worktreeinclude`](../../.worktreeinclude) 复制各端 env 文件。
- 起停脚本（AGENTS.md 第 12 节）：`node scripts/dev/proc.mjs start|stop <服务> --slot N` 支持 `api`（31N0）和 `metro`（31N2）；`start|stop api|web --local` 支持主目录 API（3018，构建产物、loopback、仅 floorwalk 角色与开发库）和 Web（3019，Vite development）。`--local` 与 `--slot` 互斥；`status` 列出本地及槽位中登记或监听的服务。PID 和日志在忽略目录 `.run/`，本地与槽位分别登记；只停自己登记的进程树，端口被别的进程占用时只报告。槽位于 2026-11-01 在 Claude Code 和 Codex 本地对话实测通过（[试行记录](../parallel-trial.md)）。
- 测试槽位（[并行组](../howto/parallel.md)）：槽位 1～3，库 `floorwalk_e2e_N`，存储目录 `apps/api/.e2e/slot-N/storage`，端口 API `31N0`、Web `31N1`、Metro `31N2`；开发端口 3018～3020 留给主目录。线上单元不跑 `pnpm e2e:slots`、`pnpm dev`；收组时 3018～3020、3110～3132 无监听、`proc.mjs status` 为空、模拟器已关、`adb reverse --list` 为空。UI 套件 `workers` 为 1，图片断言用 `naturalWidth`（g02）。新工作树按 `.worktreeinclude` 复制 env（Codex）；Claude 的工作树在 `.claude/worktrees/`（已忽略），env 要手动放入。
- 只读参考仓库：`F:\react_project\Gift2CashApp`；本轮未读取或复制其源码。

## 配置

键名和每个键的属性以各端 `.env*.example` 为准；本节记录加载层和模板位置，加载优先级与生效时机见 [本地开发说明](../howto/local-development.md#环境文件与生效时机)。值由用户填写；新增配置键必须由 AC 点名（AGENTS.md 第 8 节）。

| 子项目 | 模板（相对仓库根） | 本地文件与加载者 | 服务器 / CI |
| --- | --- | --- | --- |
| API | `apps/api/.env.development.example`、`apps/api/.env.production.example` | 同目录去掉 `.example`；包内 dev/start 由 Node 原生 env-file 加载 | 无部署环境；CI 配置未登记 |
| Web | `apps/web/.env.development.example`、`apps/web/.env.production.example` | 同目录去掉 `.example`；Vite 按 development / production mode 加载 | preview 只作本地预览；CI 配置未登记 |
| Mobile | `apps/mobile/.env.development.example`、`apps/mobile/.env.production.example` | 同目录去掉 `.example`；Node env-file 预加载，随后由 Expo 加载 | 生产配置用于 bundle 导出；CI 配置未登记 |

- 属性注释：每个键上方一行 `# 凭据：是|否；缺失：启动失败|用默认值|功能关闭；<一句说明>`（校验器 `env-attr`）。
- 新增、改名、删除一个键，同次同步所属模板（含属性注释）、消费层引用、点名它的 AC（`env-dead-key`、`env-missing-key`）。
- 同一键被不同解析器读取时，引号、空格、`#` 的处理可能不同；值含这些字符时由用户在各层验证，Agent 不读取或打印值。
- 本地缺键检查：`python scripts/validate_docs.py --env-keys`，只打印键名。FW-039 已用 `env-local` 登记 API 开发配置，检查相对同名模板的必填键是否存在，不检查值；其他端及生产配置未登记，不能据此声称各端配置齐全。各端模板属性与引用仍待对账后登记 `env-group`；本单元未读取配置值，收尾按 AC-05 追加 `MAIL_DRIVER=fake` 覆盖。
- 已启用 `env-untracked on`：普通文档校验检查真实 `.env*` 未被 Git 跟踪（`.example` 除外），不读取其内容。

API 本地开发默认监听所有网卡，e2e 槽位仍监听 loopback；Mobile 未显式配置 API 地址时用 Expo Metro 主机名访问同机 API。模型探针验证图片输入与 JSON schema；本地签名 URL 无法由模型端读取时，适配器读取照片字节并转 JPEG data URL，长边压至 1280、质量 80。模型与存储驱动行为见 [工程骨架](../specs/workspace.md)；环境变量的加载、公开变量边界、重启和重新构建要求见 [本地开发说明](../howto/local-development.md#环境文件与生效时机)。

## 基础依赖选型

以下为已安装版本；锁文件固定全部传递依赖，不能把安装成功当作原生运行通过。

| 模块      | 当前组合                                                                                                   | 验证边界                                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| API       | NestJS core/common/platform-express `12.1.2`、CLI `12.0.8`，Drizzle/pg/argon2/JWT，ESM + Express           | 开发与构建入口启动，GET /health 返回 200；契约 API e2e 覆盖登录、授权失败和固定数据 schema；业务规则见[巡检主链](../specs/inspection.md) |
| Web       | shadcn-admin `2.2.1`；React/DOM `19.2.5`；Vite `8.0.8`；TanStack Router `1.168.22`；Tailwind `4.2.2`       | 两页开发及 preview 浏览器运行、直接访问与刷新通过；无登录与业务数据                                                                      |
| Mobile    | Expo `58.0.24`、Router `58.0.31`、React `19.3.0`、RN `0.88.1`                                           | `expo install --check`、`expo-doctor`、类型检查、lint、Android Hermes bundle 和 SDK 58 原生真机回归已通过                                           |
| Mobile UI | gluestack core `5.0.15` / utils `5.0.6`；NativeWind `5.0.0-preview.4`、react-native-css `3.0.7`            | Provider、Button、theme 接入；预览版样式层按官方 v5 文档锁定，不能以 CLI 安装代替组件运行                                                |
| shared    | tsup `8.5.1`、zod `3.25.76`                                                                                | APP_NAME、巡检契约 ESM/CJS/声明、watch 与正常修改恢复通过                                                                                |
| 根检查    | ESLint `10.12.0`、typescript-eslint `8.58.2`、Prettier `3.9.9`、concurrently `10.0.5`、Playwright `1.55.0` | 类型、lint、格式、构建、三槽位 e2e 和 Mobile Web 截图通过                                                                                |

Web 固定源码 commit `e16c87f213a5ba5e45964e9b67c792105ec74d26`，gluestack 固定源码 commit `b712c8541c85d57becbd1a1b2ba150a369223eb6`。原始来源与许可证说明见 [本地开发说明](../howto/local-development.md#上游来源)。没有从旧仓库拷贝模块。

版本依据：[NestJS npm 元数据](https://registry.npmjs.org/@nestjs%2Fcore/12.1.2)、[Expo 配套依赖](https://unpkg.com/expo@58.0.24/bundledNativeModules.json)、实际 `expo install --check`、[gluestack-ui 官方源码](https://github.com/gluestack/gluestack-ui/tree/b712c8541c85d57becbd1a1b2ba150a369223eb6)。根只放检查/编排工具，应用直接声明自身运行时依赖；不以根 overrides 强迫两端共用 React。

## 验证命令

| 范围        | 命令                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 安装        | `pnpm install --frozen-lockfile`；`pnpm peers check`                                                                                                                                                                                                                                                                                                                                                                                                 |
| 全量类型    | `pnpm typecheck`，先生成 shared                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 单模块类型  | `pnpm --filter @apps/api typecheck`；Web/Mobile/shared 换相应包名；先保证 shared 已构建                                                                                                                                                                                                                                                                                                                                                              |
| lint / 格式 | `pnpm lint`；`pnpm format:check`                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 根构建      | `pnpm build`：shared → API / Mobile Android bundle / Web                                                                                                                                                                                                                                                                                                                                                                                             |
| Mobile 配套 | `pnpm --filter @apps/mobile check`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 统一开发    | `pnpm dev`，shared 构建后启动四个进程；停止一组用 Ctrl+C                                                                                                                                                                                                                                                                                                                                                                                             |
| 独立开发    | `pnpm dev:api`、`pnpm dev:web`、`pnpm dev:mobile`、`pnpm dev:shared`                                                                                                                                                                                                                                                                                                                                                                                 |
| API 数据    | `pnpm --filter @apps/api db:migrate`、`pnpm --filter @apps/api db:seed`                                                                                                                                                                                                                                                                                                                                                                              |
| API 测试    | `FW_SLOT=1 pnpm --filter @apps/api test`（API 测试使用对应槽位库 `floorwalk_e2e_N` 与槽位存储目录）                                                                                                                                                                                                                                                                                                                                                  |
| e2e         | `pnpm e2e:slots`（脚本自动分别设置槽位 1、2、3）；单槽运行 `FW_SLOT=1 pnpm e2e`、`FW_SLOT=1 pnpm e2e:mobile`、`FW_SLOT=1 pnpm e2e:cors`、`FW_SLOT=1 pnpm e2e:demo`、`FW_SLOT=1 pnpm e2e:demo-ui`、`FW_SLOT=3 pnpm exec playwright test --config=playwright.web.config.ts`。API 测试和所有单槽命令必须设置 `FW_SLOT` 为 1、2 或 3；非并行开发使用 1。                                                                                                 |
| Mobile 页面单元 | `python scripts/gate.py` 运行 `scripts/workflow.conf` 登记的 Mobile 类型、ESLint、全量 Mobile E2E 与 Web 基线门；`scripts/e2e-gates.mjs` 固定 E2E 槽位并对照 Web 基线报告。后续 Mobile 页面单元沿用这组门。 |
| Mobile 原生 | 模拟器 `Medium_Phone_API_37.0`：起槽位 API，`adb reverse` 转发 API 和 Metro 两个端口，再用 `expo start --lan --android --port <Metro 端口>` 打开；图片用 `adb push` 推进 `/sdcard/Pictures`；界面用 `adb shell uiautomator dump` 读、用 `input tap` 点；报错看 `adb logcat`。步骤和坑见上文「Android SDK」一条。Mobile 改动在动手前先读 `~/.agents/skills/expo-overview`，按它的分流加载子 skill，查 SDK 58 的版本文档，在 plan 证据里记一行读了哪些 |
| 文档        | `python scripts/validate_docs.py`；Backlog 当前工作表用 `--sync-backlog` 生成；归档前 `--archive-gate`；改校验器、钩子或 `scripts/workflow.conf` 后 `python -m unittest discover -s scripts/tests -t scripts` |

本轮未新建测试框架，使用框架命令、HTTP、浏览器和原生判据。构建成功、Metro 可响应、Expo Web e2e 通过，都不等于 Android 原生验收完成；上传、拍照这类原生路径要在模拟器上取证（AGENTS.md 第 14 节）。

## 已知偏差

- `local-pg18` 启动后可能没有发布宿主 5433（`docker ps` 只显示 `5432/tcp`）。遇到时停下，请用户执行 `docker restart local-pg18`；不要重建容器，同一容器里还有 errand 的库。
- Mobile 生产导出曾在资源输出阶段以 0xC0000005 退出；单 worker 重试成功，构建命令固定 `--max-workers 1`。根因尚未确认；真机交互结论来自单独的用户验收。

- Android SDK（2026-10-25 用户安装 Android Studio）：`C:\Users\29019\AppData\Local\Android\Sdk`，已设用户级 `ANDROID_HOME`，PATH 加了 `platform-tools`、`emulator`（新开的终端才生效）。组件：platform-tools（adb 1.0.41）、emulator、platform android-37.0、build-tools 36.0.0、镜像 `android-37.0/google_apis_playstore/x86_64`。没装 cmdline-tools（sdkmanager、avdmanager）。AVD `Medium_Phone_API_37.0`，即 Android 17 / API 37 / x86_64，自带相机应用。WHPX 已开，`emulator -accel-check` 报 usable，`emulator -avd Medium_Phone_API_37.0 -no-window` 能正常开机。Java `21.0.6` 在 PATH，没设 `JAVA_HOME`。2026-10-25 原生端探针（槽位 1）通过：`expo start --lan --android --port 3112` 自动给模拟器装上 Expo Go 57.0.9 并加载应用。用 `adb reverse tcp:3110 tcp:3110`、`adb reverse tcp:3112 tcp:3112` 后，模拟器通过 127.0.0.1 访问 API 和 Metro，不用开放局域网。`adb push` 一张图到 `/sdcard/Pictures` 再触发媒体扫描，系统照片选择器就能选到它。实测：登录 → 开始巡检 → 冷柜不合格、其余合格 → 两个必拍项各从相册选图上传，API 落盘的是真 JPEG → 缺照片时提交，提示「请完成：食品效期」→ 补齐后提交，界面显示 88，库里状态 submitted、分数 88、照片 2 张，logcat 没有 JS 错误。踩到的坑：Metro 用 `--localhost` 时只监听 IPv6 的 `[::1]`，`adb reverse` 转不过去，要改用 `--lan`，并设 `REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1`；Git Bash 里调 adb 要设 `MSYS_NO_PATHCONV=1`，否则 `/sdcard` 会被改写成 Windows 路径；Expo Go 首次打开有引导页，SDK 57 没有跳过参数，要点一次 Continue。界面用 `adb shell uiautomator dump` 读文字和坐标。
- 原 B 验收的机器门已完成，原生执行由用户明确真机确认并授权收尾；未采集手机系统版本，不声称双平台通过。当前事实见 [工程骨架](../specs/workspace.md)。
- pnpm 11 默认拦截 esbuild 安装脚本，workspace 仅显式允许 esbuild。
- Windows package script 不使用单引号包裹 pnpm filter；当前使用 `@apps/*` 包名筛选，避免未匹配任何包仍退出 0。
- NativeWind/Expo 首次运行会调整 Mobile tsconfig include；当前配置保留实际生成结果。
- gluestack 上游 README 声明 MIT，但固定 commit 根 LICENSE URL 返回 404；NOTICE 保留实际来源声明，未冒充不存在的许可文件。

## 工作流配套

- 上游模板：`F:\project\workflow\template`；同步日期：2026-11-07（workflow `d09344f`）。项目协议中的授权与产品边界保留为本地配置。
- 本地适配（只在本项目）：内核第 12 节加完全访问下的边界；`.worktreeinclude`、测试槽位、`proc.mjs` 的服务表。并行组与接力、`active-units-max`、停止条件加「已批准 spec 有矛盾或要改」、Subagent 按会话计、常驻进程走起停脚本已于 2026-11-03 抽回模板（workflow `c8b91d4`、`2c57c30`、`63aee92`），2026-11-04 同步回本项目，内核上限随模板改为 8500。
- 2026-11-07 同步：拆分接力与并行组指南，接力在主目录当前分支执行；补跨单元 AC 检查（从当天起、不追溯归档单元）、配置键检查工具及对应测试。保留项目授权、内核上限 8500、硬线路径与测试槽位；配置键分组尚未登记，见上文「配置」。验证：`python -m unittest discover -s scripts/tests -t .` 77/77 通过；用户授权「收一下」后，升迁审核去重修正并清空两条缓冲，普通文档校验通过。
- Git 工作树已存在，执行起点 HEAD `1778848`，起始工作区干净，已配置 origin；用户于 2026-10-06 确认真机验收并授权当前单元归档、提交与推送。
- `scripts/hooks/commit-msg` 已启用（2026-11-09 用户原话"启用钩子"，`core.hooksPath scripts/hooks`）：`Mode: fix` 的代码提交须暂存 testlog；改到 `scripts/workflow.conf` 登记的 `hardline` 路径须有「硬线：」行。工作树共用这项设置；停用须用户授权（`git config --unset core.hooksPath`）。
- 2026-11-23 按 `F:\project\workflow\template` 同步工作流：更新通用内核、开单元/归档/审查指南、工作单元模板和文档校验器；新增机器门脚本与提交归属钩子及测试。登记 `docs` 和 `workflow` 两道机器门，保留项目硬线路径、环境键设置、测试槽位和本地启动指南。验证：`python scripts/validate_docs.py` 通过，工作流测试 144 项通过。
- 2026-11-24 同步上游最新模板：校验器拆分为 `vd_*.py`，新增 `--sync-backlog`、`--downstream`、下游依赖和归档产物检查；机器门新增跨工作树 `history.jsonl` 记录。更新同场验收、计划单写者与归档步骤，保留 FloorWalk 的环境事实和项目索引。
