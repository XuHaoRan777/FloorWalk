# Mobile 店员巡检

> ID：`FW-005`
>
> 状态：`approved`

## 目标

并行组 g01 的并行单元（槽位 2，[`howto/parallel.md`](../../howto/parallel.md) 第 3 节）。
店员在 Mobile 上登录，看到本店今日待巡和被打回的单；能逐项巡检、给必拍项拍照、提交并看到分数；打回单上能看到被打回的项和主管意见，补拍后重新提交。

## 非目标

- 不做「记录」页（没有"我的历史单"接口，放第二组）。
- 不改 API、契约、`apps/web`、任何 `package.json`，不加依赖。界面需要的字段契约里没有，就停下报告（parallel.md 第 5 节）。
- 不做真机验收。原生相机和真机外观由用户在集成后用 Expo Go 走一遍，有问题走修正模式。

## 验收标准

界面 e2e 用 Playwright 驱动 Expo Web，连本槽位起的 API（开发期是骨架）。断言一律对照同一时刻 API 的返回，不写死分数或条数。

- AC-01（`用户要求`）：店员用邮箱和密码登录，错误密码时显示错误提示；登录后重启应用仍保持登录；在「我的」里能看到账号和门店，能退出。
- AC-02（`用户要求`）：「今日待巡」显示本店门店名、今天的模板、今天是否已提交，以及本店所有打回单，内容与 `GET /api/inspector/today` 一致。
- AC-03（`用户要求`）：做巡检：新建单后逐项标记合格或不合格、可填备注；必拍项可以选照片上传，没传照片时不能提交，并提示缺哪一项；提交后显示 API 返回的分数和状态。
- AC-04（`用户要求`）：打回单：打开后高亮最近一次打回记录里的项，显示主管意见；店员可以补拍、改结果，然后重新提交，界面显示 API 返回的新状态。用种子里 `NB-002` 的打回单（账号 `inspector+nb-002@northbean.example`）取证。
- AC-05（`用户要求`）：网络错误和接口错误（401、403、409、422）都显示可读的中文提示；401 时回到登录页。

## 验收方式

`B Agent 验收`

- 动手前加载 `expo-overview` skill（`~/.agents/skills/`），按它的路由加载 `expo-router`、`expo-data-fetching`、`expo-ui`；选组件先查 `@expo/ui`；查 SDK 57 版本的文档。
- `expo-secure-store` 在 Web 上不可用：Web 上回退到浏览器存储，原生端用 SecureStore。
- `expo-image-picker` 在 Expo Web 上打开文件选择框，Playwright 用 `filechooser` 选种子图片取证。
- e2e：`FW_SLOT=2 pnpm e2e:mobile`，测试放 `tests/mobile/`。`playwright.mobile.config.ts` 按槽位起 API（端口 3120）和 Expo Web（端口 3122），并把 API 地址传给 Expo Web；`reuseExistingServer` 关掉。`e2e:mobile` 脚本不加载 env 文件，而这一单元不能改 `package.json`，所以由配置自己加载 `apps/api/.env.development` 拿连接信息，不打印。不跑 `pnpm e2e:slots`。

## 涉及的当前事实

- 拟新增 `specs/mobile-inspector.md`（店员端的行为），由集成单元 FW-007 归档时 Promote 生成。
- [`specs/workspace.md`](../../specs/workspace.md)「Mobile 运行」：首页从骨架演示改为店员巡检。由 FW-007 统一 Promote。

## 依赖

- FW-003

## 批准记录

- 批准依据：用户 2026-10-24 批准并行组 g01 的范围与 5 项默认，原话"需要我确认的5项全安你建议的来。建议补充的也加上。"；Mobile 走方式 B，原话"关于mobile，我还是想B验收"。
- 批准时间：`2026-10-24`
- 特殊授权：并行组 g01，写入范围：`apps/mobile`（不含 `package.json`）、`tests/mobile/`、`playwright.mobile.config.ts`；在本分支 `g01/FW-005` 本地提交，不推送；只用 `floorwalk` 角色连 `floorwalk_e2e_2`。
