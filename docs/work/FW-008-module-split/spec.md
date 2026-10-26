# 按功能拆模块

> ID：`FW-008`
>
> 状态：`approved`

## 目标

API 控制器、Web 控制台页、Mobile 主组件按功能拆成文件，第二组 g02 的三个并行单元（聊天、控制台 CRUD、Mobile 记录页）各自改的现有文件不再交叉（[`howto/parallel.md`](../../howto/parallel.md) 第 0 节准入第 3 条）。
除 AC-03 写明的 Mobile 导航变化外，用户和调用方看到的行为不变。本单元同时是 g02 之前的串行基线，按 [试行记录](../../parallel-trial.md)「值不值」的口径记人工触点。

## 非目标

- 不拆 `packages/shared/src/contract/`：契约由 g02 的契约单元在开组前一次写完，并行单元不改它。
- 不改契约、`apps/api/src/auth.ts`、`apps/api/src/db/schema.ts`、迁移、任何 `package.json` 和 `pnpm-lock.yaml`，不加依赖。
- 不新增或修改接口，不改 Web 的路由和页面结构，不改任何文案和样式。
- 拆分时发现的 bug 不在本单元修：记进 plan「决策与偏差」，归档后按修正模式处理。

## 验收标准

- AC-01（`用户要求`）：API 按功能拆成控制器：认证（登录、`/me`）、店员巡检（今日待巡、创建、详情、更新检查项、提交）、证据（上传、签名取图）、审核（队列、审核动作）、看板。几个控制器共用的查询和工具（时间格式、上海日界、证据签名、读巡检详情）抽到同目录的共用文件；`app.module.ts` 每个控制器一行注册。`inspection.controller.ts` 不再包含认证、审核、看板的代码。
- AC-02（`用户要求`）：Web 控制台的队列、审核详情、看板、共用小组件（错误条、状态标签、证据图片）各成一个文件；`pages/console.tsx` 只留登录态、角色判断和分区切换。Mobile 的登录、今日待巡、我的、巡检四个屏幕和共用的按钮、错误条各成一个文件。两端的 API 客户端（`lib/api.ts`）拆成共用的请求函数加按功能的文件，各功能文件导出自己的方法，`api` 对象由它们合成，调用方的写法不变。
- AC-03（`建议采纳`）：Mobile 底部切换改成 Expo Router 的 Tabs：未登录只显示登录页，没有底部栏；登录后底部栏有「今日待巡」「我的」两项；巡检详情是叠在 Tabs 上的独立页面。会变的行为只有两条：在巡检详情按 Android 返回键回到今日待巡（原来是退出应用）；Expo Web 的地址随页面变化。未登录直接打开任何页面地址，都回到登录页。实现前加载 `expo-router` skill，用 `expo-router/tabs`，不加依赖。
- AC-04（`建议采纳`）：业务源文件超过 400 行时 `pnpm lint` 报错（ESLint `max-lines`，不计空行和注释）。不计：测试文件、`components/ui/` 下照搬的组件库、`packages/shared/src/contract/`（不拆，见非目标）。拆完后 `pnpm lint` 通过。
- AC-05（`建议采纳`）：新增 `scripts/api-snapshot.mjs`：重置一个槽位库、起该槽位 API，按路由表对每个接口、每个角色各发一次真请求，并跑一遍演示链的写操作；把响应去掉 id、时间、签名后写成一份 JSON。拆前、拆后各跑一次，两份逐字节相同。用 `FW_SLOT=N node --env-file=apps/api/.env.development scripts/api-snapshot.mjs <输出路径>` 运行，不加 `package.json` 脚本，不打印 env。
- AC-06（`用户要求`）：拆前、拆后在同一槽位都全绿：API 测试、契约 e2e、`e2e:mobile`、Web e2e、`e2e:cors`、`e2e:demo`、`e2e:demo-ui`。测试的断言不改；为 AC-03 的导航变化改界面 e2e 的定位方式（如点 Tab 的写法）可以，每处在证据备注写明。
- AC-07（`用户要求`）：Mobile 原生链在模拟器上通过：登录 → 开始巡检 → 两个必拍项从相册选图上传 → 提交，界面显示 88；切到「我的」再切回；在巡检详情按返回键回到今日待巡；logcat 无 JS 错误。
- AC-08（`用户要求`）：全量门禁通过（类型检查、lint、`format:check`、构建）；`git diff --stat` 对比开工前，契约目录、`auth.ts`、`schema.ts`、迁移目录、所有 `package.json`、`pnpm-lock.yaml` 零改动。

## 验收方式

`B Agent 验收`

- AC-03 改的是导航，Tabs 的外观与原底部栏可能不完全一样（字体、图标、高度）。本单元不做人工外观验收；外观有问题，归档后按修正模式调。
- AC-05 的快照文件写在 `evidence/` 下，不入库；脚本入库，供 g02 及以后的重构复用。

## 涉及的当前事实

- [`specs/mobile-inspector.md`](../../specs/mobile-inspector.md)「登录与今日巡检」：底部栏改为 Tabs、巡检详情按返回键回到今日待巡；「数据契约」表的代码链接改到拆后的文件。
- [`specs/web-console.md`](../../specs/web-console.md)「数据契约」：代码链接改到拆后的文件。
- [`specs/inspection.md`](../../specs/inspection.md) 开头的代码位置：API 控制器改为拆后的文件。
- [`specs/workspace.md`](../../specs/workspace.md)「API」「Mobile」两行：代码链接改到拆后的文件；补一行"业务源文件 400 行上限由 lint 检查"。

## 依赖

- FW-007

## 批准记录

- 批准依据：用户 2026-10-26 采纳全部三条建议（原话"你建议补充的全加上"），随后批准 spec（原话"批准 FW-008，提交推送后给我 Codex 启动语。"）
- 批准时间：`2026-10-26`
- 特殊授权：无。在主目录 master 上做，按任务本地提交，用户说推送再推送。
