# UI 基础：两端统一设计

> ID：`FW-016`
>
> 状态：`approved`

## 目标

Web 控制台和 Mobile 用同一套设计（颜色、字体、圆角、间距、阴影），现有全部页面换成新样式，排版和质感按三个阶段依次做到位。用户挑选方向、验收最终效果。之后的功能单元都在这套组件上开发。

## 非目标

- 不改任何产品行为、接口、数据、路由和文案含义；只改样式、布局、组件选用，以及加载、空、错误状态的呈现。
- 不换组件库、不迁移样式方案：Web 保留 shadcn + Tailwind 4，Mobile 保留 gluestack-ui v5 + NativeWind 5。
- 不做按商家换主题，不做深色模式开关（token 留深色值，界面不提供切换）。
- 不做演示说明页、新页面、新功能；Mobile 只覆盖现有店员页面。
- 不跑 design-taste-frontend 的 `assets.mjs`（联网取图），后台界面不放装饰图片。

## 三个阶段

按顺序做，后一阶段开工前先审一遍前一阶段的产物。审出前一阶段的缺陷（布局错位、溢出、遮挡、状态缺失），在本阶段直接修，每处写进证据；不改前一阶段定下的方向和 token 的值。同一次前置审查发现超过 3 处，或缺陷要改产品行为、接口、写入范围外的文件，停下报告。（2026-11-02 用户原话"按建议"：原写法"发现问题停下报告，不顺手改前一阶段的边界内容"把前一阶段留下的 bug 也挡住了）

| 阶段   | 只改                                                         | 不许碰           | 交付                                                  | 必须用的 skill                                                                                                                                                                     |
| ------ | ------------------------------------------------------------ | ---------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 方向 | 共享 token、两端主题接入、一张样张页                         | 现有页面代码     | 2～3 个方向的样张给用户挑；`DESIGN.md` 写定选中的方向 | `design-taste-frontend`（`draw.mjs --app` 出方向）、`ui-ux-pro-max:design-system`（token 体系）、`create-design-md`（写 `DESIGN.md`）、`expo-design-system`（接进 gluestack 主题） |
| 2 结构 | 两端全部现有页面的布局、信息层级、组件选用，加载/空/错误状态 | token 的值       | 两端页面换成新组件                                    | Web：`improve-ui`（先审现状）、`shadcn`；Mobile：`mobile-app-ui-design`、`expo-native-ui`                                                                                          |
| 3 质感 | 动效、按压反馈、细节阴影、图标统一、可访问性                 | 布局、token 的值 | 只做增量                                              | 两端都用 `design-taste-frontend`（`--keep palette,type`，按 app-screen 的改版流程）、`fixing-accessibility`；Web 加 `baseline-ui`；Mobile 加 `expo-animation`                      |

- design-taste-frontend 一律按 app-screen 流程（`references/app-screens.md`、`draw.mjs --app`、`inspect.mjs --app`），不用落地页规则。
- 阶段 3 用它做改版时，先把阶段 2 的截图存到 `.taste-skill/before`，做完存到 `.taste-skill/after`，两组对比。
- 执行器缺上表任何一个 skill，停下告诉用户缺哪个，不凭记忆代替。
- 在 Mobile 上，design-taste-frontend 只能当规则清单用：它的检查器只测网页。Mobile 的效果以模拟器截图为准。

## 验收标准

- AC-01（`用户要求`）：阶段 1 交付 2～3 个方向的样张，每个方向在 Web 和 Mobile 各有一张样张页，用户在其中挑一个；没挑之前不进阶段 2。
- AC-02（`建议采纳`）：选中方向的颜色、字体、圆角、间距、阴影只在一个共享 token 源里定义，两端的主题都从它读取或生成；页面代码里没有写死的颜色值（`#xxx`、`rgb(`），检查命令写进证据。
- AC-03（`用户要求`）：两端全部现有页面换成新样式。Web：登录首页、审核队列、审核详情、总部看板、门店、模板、聊天面板；Mobile：登录、今日待巡、巡检详情（含补交）、记录列表、记录详情、我的、聊天面板。
- AC-04（`建议采纳`）：每个列表和详情都有加载中、空、出错三种状态的呈现，文案沿用现有中文。
- AC-05（`建议采纳`）：Web 在 1440、768、390 三种宽度下，`inspect.mjs --app` 对不需要登录的页面（登录首页、`/_design-samples`）0 FAIL，WARN 逐条在证据里说明为什么保留；`lint.mjs` 对全仓 0 FAIL。登录后的页面（审核队列、审核详情、总部看板、门店、模板）用 Playwright 按三种宽度截图，按 design-taste-frontend 的 `references/critique.md` 逐屏批评，每屏至少修掉排在前三的问题，证据里写每屏改了什么。（2026-11-02 用户原话"都按建议"：`inspect.mjs` 只接收一个 URL、不能登录，原写法做不到；标签按改动来源改为建议采纳不变）
- AC-06（`建议采纳`）：可访问性：token 里每一对实际用到的前景色与背景色算出对比度，正文 ≥ 4.5、大字与图标 ≥ 3，列表写进证据；Web 用键盘 Tab 走一遍登录与审核详情，每个可聚焦元素有可见焦点；表单项都有标签；Mobile 触控目标不小于 44pt。（2026-11-02 用户原话"都按建议"：原写法"运行时对比度"没有可用工具，改为按 token 计算）
- AC-07（`建议采纳`）：现有全部 e2e 和 API 测试全绿：`pnpm e2e:slots`、Web 与 Mobile 界面 e2e、`e2e:cors`、`e2e:demo`、`e2e:demo-ui`；类型检查、lint、`format:check`、构建通过。测试只允许改定位方式，不许删用例、不许放宽断言，每处改动写进证据。
- AC-08（`建议采纳`）：Mobile 在 Android 模拟器上走一遍店员主链：登录 → 今日待巡 → 开始巡检 → 逐项填写并从相册传照片 → 提交 → 记录 → 我的；每屏截图存 `evidence/`，logcat 无 JS 错误。
- AC-09（`用户要求`）：阶段 3 做完后用户在 Web 和 Android 模拟器上看过并确认。

## 验收方式

`A 人工验收`

- 人工两次：阶段 1 挑方向（AC-01），阶段 3 后看最终效果（AC-09）。阶段 1 那次在阶段内停下等用户，不算 `blocked` 收尾；阶段 2、3 不再停。
- AC-02、AC-04～AC-08 由 Agent 取证。

## 涉及的当前事实

- [`specs/workspace.md`](../../specs/workspace.md)：Web 页面壳与 Mobile 运行相关小节，加设计 token 的位置和两端主题的接入方式。
- [`specs/web-console.md`](../../specs/web-console.md)、[`specs/mobile-inspector.md`](../../specs/mobile-inspector.md)：只在行为描述受影响时改（如状态提示的呈现），不改业务规则。

## 依赖

- 无

## 批准记录

- 批准依据：用户 2026-11-02 原话"批准，预授权依赖"；三阶段边界与各阶段 skill 由用户在讨论中定（第 3 阶段指定 design-taste-frontend）
- 批准时间：`2026-11-02`
- 特殊授权：写入范围：`apps/web/src/`、`apps/web/index.html`、`apps/mobile/app/`、`apps/mobile/components/`、`apps/mobile/global.css`、`apps/mobile/tailwind.config.*`、`packages/` 下新建的 token 包或文件、`tests/`、`playwright.*.config.ts`、`DESIGN.md`、`.gitignore`（加 `.taste-skill/`）。不改 `apps/api/`、契约、`schema.ts`、迁移。加依赖：已预先授权，只限样式相关的包（字体、图标、动效），每加一个在 plan「决策与偏差」写一行原因，不停下问。阶段 1 结束前要用户挑方向，这一次停下不算违反"持续推进"。
