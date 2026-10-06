# Monorepo 骨架与各模块启动 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`active`
- 当前任务：T01—T07 完成；用户真机确认已补齐 T06，待完成归档提交
- 阻塞：无。2026-10-06 用户确认真机 Expo Go 加载成功、首页体验按钮无误并授权归档提交推送；原生证据按 spec 最新批准记录接受用户验收，未记录设备操作系统。
- 下一步：提交修正、验收与 Promote 文档，干净工作树通过归档门后归档，再提交推送；不重复已完成的整轮审查。

2026-10-06 执行预检：Node `24.19.0`、pnpm `11.21.0`；文档校验通过，Git HEAD `1778848`，工作区起始干净，已有 origin。此前编排时“尚无 Git 工作树”的情况已解除。本轮没有与单元无关的未提交修改。

Android 调查：PATH、ANDROID_HOME / ANDROID_SDK_ROOT / ANDROID_AVD_HOME、默认 SDK/AVD 目录以及 C/D/E/F 常见安装目录均未定位可用入口；无相关进程、adb 5037 无监听；Java `21.0.6` 可用但不足以运行原生验收。未全盘扫描，也未安装或启动系统级 Android 资源。

## 任务表

| ID | 任务 | 状态 | 依赖 | 验证方式 |
| --- | --- | --- | --- | --- |
| T01 | 核验并锁定兼容工具链，建立根 workspace、四个包清单与最小检查配置；定位 Android 运行环境和 Git 条件 | `done` | 规格批准 | AC-01、AC-06：记录版本和上游 commit；包发现、依赖解析与安装；确认各任务环境缺口，不启动或修改归属不明的服务 |
| T02 | 建立 shared 的构建、watch、入口与声明文件 | `done` | T01 | AC-02：构建及 watch 产物可导入；消费者的实际引用随 T03—T05 完成并在 T06 汇总 |
| T03 | 建立 NestJS 12 API，接入 shared 并提供进程探针 | `done` | T02 | AC-03：模块类型检查；开发和构建入口、HTTP 响应的完整运行证据在 T06 收口 |
| T04 | 集成 shadcn-admin，建立宣传首页占位与控制台演示壳，接入 shared | `done` | T02；执行顺序在 T03 后 | AC-04：受影响模块类型 / lint 检查；页面、导航、刷新和 preview 验证在 T06 收口；保留 MIT 声明 |
| T05 | 建立 Expo / React Native 应用，接入 gluestack v5、路由和 shared | `done` | T02；执行顺序在 T04 后 | AC-05：Expo 版本匹配检查与模块类型检查；Android bundle 与设备运行在 T06 收口；环境不可用时记录 blocked，不以 Metro 或 Web 替代 |
| T06 | 完成统一启动命令、B 验收、资源清理和本地运行说明 | `done` | T03、T04、T05 的所需实现；可先验证不受阻 AC | AC-01—AC-06：冻结安装、shared 正常修改 / 恢复、根检查和构建一次、API HTTP 响应、Web 浏览器、Android 原生交互和多进程协同；每条 AC 一行证据 |
| T07 | 最终代码审查 | `done` | T06 全部 AC 通过；本轮按用户收尾指令先行审查，原生证据核实不阻塞只读审查 | 独立只读上下文读取 spec、plan、完整差异，按 AGENTS 七域逐项结论；无新增 finding；原生证据已于本次用户验收补齐 |

按上述顺序一次推进一个任务。独立调查可只读委派，局部实现同一时刻最多一个写入型代理；任何代理都不改本单元状态或 Backlog。T01—T05 只跑相应机器门，不安排任务级复审。

## 证据

每条 AC 汇总一行；未完成的原生证据不以 bundle 或 Node 导入替代。T07 由独立只读上下文单独执行；早期环境调查不算代码审查。

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01/T06 AC-01 | passed | `pnpm install --frozen-lockfile`；`Get-FileHash pnpm-lock.yaml -Algorithm SHA256`；`pnpm peers check`；`pnpm -r list --depth -1` | 命令输出；根锁文件与四包清单 | 冻结安装退出 0，前后哈希均为 `9F84A11920A8D6150A552E5E497A2DB515BB86E59E3A8AE3595FC262951A4CAA`；无 peer 问题；Node 24.19.0 / pnpm 11.21.0；上游 commit 与工具版本见下方决策及开发环境 |
| T02/T06 AC-02 | passed | `pnpm dev` 中 shared watch；正常修改并恢复 APP_NAME；三个应用目录 `node --input-type=module -e "import('@libs/shared').then(m => console.log(m.APP_NAME))"` | shared ESM/CJS/声明；API 日志；Web 浏览器观测 | watch 重建后三个包均导入 FloorWalk Watch，API 日志及 Web 两页实际更新；恢复后重新输出 FloorWalk。Mobile 页面引用 shared，Android bundle 成功；2026-10-06 用户真机确认加载与首页按钮正常，补齐原生显示证据；无 shared 框架/UI 依赖 |
| T03/T06 AC-03 | passed | `pnpm dev`；`pnpm --filter @apps/api start`；`Invoke-WebRequest -NoProxy http://127.0.0.1:3000/health` | 开发与构建运行日志、HTTP 输出 | 两种入口均启动，HTTP 200 且精确 JSON `{"status":"ok"}`；日志均消费 shared 名称；仅一个业务无关探针 |
| T04/T06 AC-04 | passed | Codex 浏览器验证 5173/4173 的 `/` 与 `/console`、点击导航、直接访问、刷新 | 浏览器 AX/DOM、一次控制台画面、错误日志为空；`apps/web/LICENSE` | 首页无后台栏，控制台使用上游布局并显示“演示骨架，尚未接入登录”；返回链接和 sidebar trigger 可操作；开发与 preview 均通过；无 Clerk/模拟登录/真实用户数据 |
| T05/T06 AC-05 | passed | `pnpm --filter @apps/mobile typecheck`；`pnpm --filter @apps/mobile check`；根构建中的 `expo export --platform android --output-dir dist`；Android 环境只读检查 | Expo 配套检查 passed；2092 模块、4.5MB Android Hermes bundle；环境调查输出 | Expo / RN / React 及 gluestack 已接入，类型/配套/bundle 通过；修正后 Mobile typecheck 与单 worker Android Hermes 导出再次通过。2026-10-06 用户确认“移动端真机expo go加载成功，首页体验按钮无误”，并授权归档；按最新批准记录接受用户原生验收，不冒称 Agent 亲测或双平台通过。Expo Web 修复后未采集浏览器交互证据，非本单元原生验收替代项 |
| T06 AC-06 | passed | `pnpm typecheck`；`pnpm lint`；`pnpm format:check`；`pnpm build` 修复 filter 后从应用构建续跑；`pnpm dev`；端口/进程核对与清理 | 根命令、构建输出、多进程日志；[本地启动说明](../../howto/local-development.md) | 全量类型/lint/格式各一次通过；shared/API/Web/Android bundle 均构建；统一入口并发运行，三个应用各占独立端口；记录见下表。原生展示缺口在 AC-05；根构建 filter 问题与修复已记下方。后续只对受工具改动的 Mobile tsconfig 做格式归一与类型复核 |

### T07 独立七域审查

2026-10-06，独立只读 Subagent `/root/final_review`（未继承实现会话）读取 spec、plan 及相对 HEAD 的全部非环境文件暂存差异。按安全规则排除所有 `.env*` 内容，仅核对模板路径，因此不对六份模板内容作独立保证。主 Agent 已核对审查结论及相关差异；结论 passed，无新增可行动 finding，未重复运行机器门。

| 失败域 | 结论与证据 |
| --- | --- |
| 认证与授权投影 | 不适用：无认证或权限投影；仅公开健康探针及明确标注未登录的演示壳。 |
| 越权与混淆代理 | 不适用：无资源归属、代理调用、敏感导出或业务数据路径。 |
| 并发与幂等 | 未发现问题：无数据库写入、重复提交或跨资源事务；Mobile 按钮仅设置本地布尔状态。 |
| 数据解码与序列化 | 未发现问题：健康响应为固定 JSON；API/Web 端口检查整数范围；无 SQL、时间、数值或分页解码。 |
| 迁移与回滚 | 不适用数据库迁移；未改变迁移历史或持久化结构，版本及依赖已固定。 |
| 敏感数据与日志 | 已读差异未见凭据或敏感日志；启动日志仅输出项目名、地址与端口；env 内容未读取。 |
| 范围与结构膨胀 | 四包、shared 常量、探针、两页演示壳、Mobile UI 与工具配置对应 AC-01—06，环境化配置对应后续用户批准；无业务 schema、DTO 或新增业务契约。 |

锁文件直接核对 importers，并静态解析完整 11696 行：1080 个 package、1104 个 snapshot、2688 条依赖边均有目标；无额外包来源 URL，仅三个 shared workspace link。审查无文件写入、状态修改或外部副作用。审查当时的剩余风险：AC-02/AC-05 原生运行未验证（后由用户真机确认解除）；Mobile 导出曾出现 0xC0000005，单 worker 已通过但根因未确认。

### 本轮资源记录

所有启动前均检查端口无既有监听，工作区根为 `F:\project\FloorWalk`。

| 入口 | 工作目录 | 进程 / 端口 | 清理 |
| --- | --- | --- | --- |
| 统一开发 | 根目录 | concurrently PID 108120；shared tsup watch 无端口 | Ctrl+C 结束所属执行会话 79157 |
| API dev | apps/api | 初始 PID 104452，watch 更新 108956，恢复后 99576；127.0.0.1:3000 | 同组结束，端口释放 |
| Web dev | apps/web | PID 101688；127.0.0.1:5173 | 同组结束，端口释放 |
| Mobile Metro | apps/mobile | PID 15848；localhost:8081 实际监听 ::1；`/status` 返回 packager-status:running | 同组结束，端口释放；IPv4 127.0.0.1 并非该次监听地址，本地说明使用 localhost |
| API 构建产物 | apps/api | PID 79008；127.0.0.1:3000 | Ctrl+C 结束会话 85531 |
| Web preview | apps/web | PID 72376；127.0.0.1:4173 | Ctrl+C 结束会话 22745 |

结束后 3000/5173/8081/4173 均无监听；仅清理本任务启动的资源。未启动数据库、容器或 Android 工具。构建产物在各包忽略的 dist 中，可由根构建再生成；无临时测试实例或验证脚手架。

## 决策与偏差

- 2026-10-06 最终收尾：用户明确确认真机加载与体验按钮并授权归档提交推送，替代此前“保留原生验收阻塞”的指令；验收来源与平台证据边界记入 spec 批准记录。T06、AC-02、AC-05 改为通过，沿用已完成 T07。本次修正按修正模式无独立复审；未命中 schema/权限/认证等硬线。已生成 workspace 当前事实，环境化配置及 LAN/主题修正纳入长期文档，清空 testlog 缓冲。下列记录保留当时执行过程，不代表当前阻塞。

- 2026-10-06 用户对归档条件的明确回复：“只验了服务启动；保留原生验收阻塞，先提交推送”。T06/AC-02/AC-05 保持 blocked，归档状态保持 active；本轮不 Promote specs、不清空 testlog，不执行归档操作。修正记录随此次工程提交保存，后续最终归档再同步。
- 提交前差异检查发现 Web MIT 文本末尾多一个空行，已仅清理 EOF 空行，许可内容不变；不触发代码测试。

- 2026-10-06 用户确认启动与端口正确，明确授权提交工作区、归档及推送。按该最新指令先行 T07 独立只读审查；Android 原生按钮验收事实单独核实，不能虚报通过。此前“不包含提交/推送”的限制已由本次授权解除，尚未实际提交或推送。

- 2026-10-06 环境配置修正完成：用户批准三端各自 .env.development / .env.production，端口通过各应用配置加载；Web dev/preview 均为 3019，替代此前 preview 4173 的选择。六份实际文件已创建并被 Git 忽略、六份 example 模板可提交；无新增运行时依赖，不读取任何 env 文件内容。
- 验证：三包类型通过；API/Web 构建通过。API 生产 PID 21628 / 3018、Web preview PID 65740 / 3019；开发 API PID 87376 / 3018、Web PID 68928 / 3019、Metro PID 104748 / ::1:3020，HTTP 200、health JSON 与 packager-status 均符合预期。各启动前检查端口归属，结束后 Ctrl+C 清理对应会话，未操作其他进程。
- Mobile 生产导出调整为 --max-workers 1 后成功，2092 模块、27 项资源、4.5MB Android Hermes bundle 和 metadata 生成，已将该验证通过的选项固定到 build；首次 0xC0000005 根因未确认，不继续无依据重试。原生 Android 验收仍受环境缺口阻塞，T06/T07 状态不变。其余环境行为详见 context/howto 与 testlog，不把旧运行记录改写为新证据。


- 2026-10-06 用户批准三模块各用 .env.development / .env.production。环境配置调整中，Mobile 生产导出在完成 2092 模块后、打印 Assets 时退出 3221225477（0xC0000005），未生成可用 dist；同期 API/Web 构建成功。根因尚未确认，假设并发或 worker 资源压力；下一次只运行 Mobile export --max-workers 1，隔离并发条件，不机械重跑全量。

- 2026-10-06 用户追加端口修正：API 3018、Web dev 3019、Mobile Metro 3020，Web preview 4173。实现和启动说明已同步，三包类型检查通过，详见 [修正记录](../../testlog.md)。上方运行证据与进程表保留当时真实旧端口，不作为新端口已运行的证据；后续验收按新配置执行。未重新构建，直接运行 API 构建产物前须按本地开发说明先构建以更新 dist。

- 2026-10-06 本轮停止：T01—T05 done，T06 blocked，T07 pending；不标 verified，不 Promote specs/，不归档，不执行 archive-gate 冒充收尾。原生环境补齐后只续缺失验收和一次独立七域审查。
- T06 补充：NativeWind/Expo 首次启动调整了 Mobile tsconfig include；保留工具生成的实际配置，格式归一后只复核 Mobile 类型，不重复全量检查。Metro localhost 在本机监听 IPv6 ::1，首次用 IPv4 请求未达，改按实际监听地址读取 /status 成功。
- 上游许可缺口：gluestack 固定 commit 根 README 声明 MIT / Copyright © 2026 GeekyAnts，但其根 LICENSE URL 返回 404；原声明与精确来源保存在 apps/mobile/NOTICE，不把 CLI 包的 mayank-96 版权冒充 starter 组件版权。Web MIT 全文已保留。


- T06 根构建发现 Windows 包脚本单引号使 pnpm 目录 filter 未匹配应用，命令虽退出 0 但不算构建通过。AC-06 修复 1：改为不带 shell 引号的包名 @apps/* filter。下一次从应用构建阶段续跑，核对三应用实际产物，不重复 shared 或已通过检查。

- T05 实现完成：第二次修复后 Mobile 类型与 Expo 配套检查均通过。SDK 57 + RN 0.86.3 + React 19.2.3，gluestack 源码固定 b712c8541c85d57becbd1a1b2ba150a369223eb6，core 5.0.15 / utils 5.0.6，NativeWind 5.0.0-preview.4 / react-native-css 3.0.7；原生运行仍未验证。

- T05 修复 1 后安装成功；TypeScript 6 的副作用导入检查报 global.css 无声明（TS2882）。修复 2：新增 CSS 模块类型声明，保留检查；下一次只验证 Mobile 类型与 Expo 配套，若仍红按预算停止。

- T05 类型检查通过；Expo install --check 首轮报告配套要求 react-native-web ^0.21.2、@babel/core ^7.29.0、TypeScript ~6.0.3。修复 1：仅 Mobile 按 Expo 要求锁定 0.21.2 / 7.29.0 / 6.0.3；其他包维持 5.9.3。下一次实验：安装后复跑 Mobile 类型检查及该配套检查；不替换已批准框架。

- T04 实现完成：固定 commit 的 shadcn-admin 布局与必要 Radix 组件保留 MIT；仅两页，不接 Clerk/模拟登录，不保留模板用户/业务演示；Web 类型检查与 lint 通过，浏览器及 preview 待 T06。

- T03 实现完成：仅 GET /health 返回 {status: ok}，启动日志消费 APP_NAME；ESM 修复后 API 类型检查通过。

- T03 类型检查首轮失败（TS1479）：安装的 NestJS 12 已是 ESM，API 默认 CommonJS 与其冲突。修复 1：API 声明 type=module，Node16 解析与相对 .js 导入保持一致；下一次只跑 API 类型检查，运行验证仍在 T06。

- T02 实现完成：shared 仅导出 APP_NAME，tsup 生成 ESM/CJS 和双声明入口，构建与类型检查通过；watch 正常修改/恢复与三应用消费在 T06 汇总。

- T01 完成：修复 1 后安装退出 0；pnpm peers check 无问题；根项目加四个 workspace 包发现正常。Node 24.19.0、pnpm 11.21.0、NestJS 12.1.2、Expo 57.0.26、TypeScript 5.9.3；Web 固定上游 commit e16c87f213a5ba5e45964e9b67c792105ec74d26。冻结安装在 T06 汇总。

- T01 首次安装退出 1：pnpm 11 拦截 esbuild 安装脚本；peer 检查显示 Mobile 自动补齐的 react-dom 19.2.5 与 Expo React 19.2.3 不匹配。修复 1：仅允许 esbuild 构建脚本、Mobile 显式声明匹配的 react-dom / Web peer 和 Metro 工具依赖；TypeScript 固定 5.9.3，typescript-eslint 使用上游已采用的 8.58.2，移除首次安装自动生成的新版本年龄例外。下一次实验为重新安装并检查 peers，不切换框架大版本。
- T01 环境结论：只读 Subagent 在 PATH、Android 环境变量、默认及常见 SDK/AVD 目录未找到 adb/emulator/SDK；无 Android 相关进程、5037 无监听，只有 Java 21.0.6。AC-05 原生运行缺口保留，不安装系统环境；其余实现继续。

- 2026-10-06 执行预检：规格已获整体批准；Git 已初始化，HEAD 为 `1778848`，入口 `git status --short` 为空，已有 origin；先前“不在 Git 工作树”的记录仅为编排时历史。文档校验通过（0 个问题）。

- 2026-10-06：用户要求先编排任务，采用建设模式、B Agent 验收；本轮只建立 spec / plan 和 Backlog 登记，不写业务代码、不安装依赖。
- 编排独立审阅：只读 Subagent 检查任务依赖、AC 可验证性、授权归因、B 验收及归档阻塞；发现 Android 平台并非用户原始要求，已从 AC-05 中分离为待明确采纳的验收细化。此为计划审阅，不替代 T07 最终代码审查。
- 当前七项实施任务为批准候选；批准后若新增任务数超过批准数一半，按协议停止扩大单元。
- shared 是库，不启动 HTTP 服务；验收为构建 / watch / 三应用实际消费。
- Web 控制台在本单元只验布局壳；真实登录和权限留给后续工作，不保留模板的模拟认证作为可用登录功能。
- Android 原生运行是候选平台细化，待规格批准；若缺 SDK、模拟器镜像或可用设备，报告具体缺口；系统级安装与外部服务按已有授权边界办理。
- 本单元不以新增整套测试框架为独立目标；优先使用所选框架自带命令、HTTP 客户端、已有浏览器与 Android 调试能力完成 B 验收，不临时搭建替代业务实例。
- 所有 AC 与 T07 通过后才标 verified；按 spec 指定位置 Promote 当前事实及运行说明。归档前必须通过 `python scripts/validate_docs.py --archive-gate` 且 `git status --short` 为空；没有提交授权时保留真实未归档状态并报告，不能用删除工作成果换取清洁工作树。
