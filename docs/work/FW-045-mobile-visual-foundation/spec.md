# Mobile 视觉基础与样板页

> ID：`FW-045`
>
> 状态：`approved`

## 目标

为 Mobile 建立复用 Web 品牌方向的交互与视觉规则，落地店长今日首页和管理员模板编辑两张成品样板。
导航、页面框架和状态表达按已批准骨架统一，后续页面以这两张样板和 Mobile 设计规范为准。

## 非目标

- 不改变任一角色能做的事、权限、业务语义或数据用途。
- 不新增 API、共享字段、配置、schema、外部依赖或角色。
- 不为 Mobile 另选方向，不修改共享 token 的实际取值，不改 Web 设计规范。
- 不在本单元将样式铺到所有 Mobile 页面。样板以外的页面只做必要导航/壳层接线并保证可达。
- 不修店长详情空验收要点触发的 `Unexpected text node`，排到后续 Mobile 页面单元处理。

## 验收标准

- AC-01（`用户要求`）：Mobile 设计规范写入 `docs/context/mobile-design.md`，复用 `docs/context/design.md` 的浅色「钴蓝运营台」和 `packages/tokens/tokens.css`。Native 消费 `packages/tokens/native.json`；颜色、字号、间距、圆角不得另建来源。图标使用 `lucide-react-native`，Web L1 / E1 / R2 品牌资产用已安装 `react-native-svg` 适配。
- AC-02（`用户要求`）：店长登录后显示「今日待巡」首页。Logo 和通知入口位于安全区内固定首页品牌栏；标题、刷新、进度和任务列表作为一个滚动内容区。任务行从现有 Today API 显示模板、时间窗和任务状态并进入既有详情路由。任务继续按钮居中，至少 44 dp 高，宽度随手机屏幕适配。空状态沿用现有刷新操作和 E1 今日空状态线稿语法。
- AC-03（`用户要求`）：店长底栏顺序为「今日待巡、记录、通知、我的」；管理员底栏顺序为「今日、审核、看板、管理、我的」，个人资料固定末项。主要点击区至少 44 dp。管理员 Tab 当前态、页面入口和主操作用品牌蓝，成功/警告/危险使用各自语义 token。
- AC-04（`用户要求`）：管理员登录和首次改密后进入「今日视图」。该首页固定显示品牌 Logo 与通知入口。「管理」Tab 为配置首页，按 Web「管理配置」分组显示现有「人员管理、门店、模板、AI 审核标准、日程方案、门店日程安排」路由。
- AC-05（`用户确认`）：管理员「模板编辑」作为差异样板。Logo 和通知只固定在今日首页。模板页没有全局固定顶部栏，单一页面标题/返回区属于滚动正文；保存和取消固定在正文和底部 Tab 之间。表单使用现有模板和 AI 标准字段，不增加展示数据或改变保存契约。
- AC-06（`建议采纳`）：从店长通知打开任务时，返回回原通知收件箱；管理员从通知打开审核详情时，返回回通知收件箱。其他详情遵循导航栈返回来源。详情返回区在滚动正文中，不另加固定全局顶栏或重复返回入口。
- AC-07（`用户要求`）：任务列表、模板表单和导航在 390 dp、360 dp 原生模拟器视口下无页面级横向滚动，文本不互相遮挡。新引入或重新组织的点击区至少 44×44 dp；首页与模板页截图均来自 Android SDK 58 Expo Go 模拟器，不能以 Expo Web 截图代替。
- AC-08（`用户要求`）：店长空任务使用 Web E1 今日插画语法；管理员审核详情在现有评分和判定字段上沿用 Web R2 分段圆环及通过/失败/未判定语义。R2 完成反馈在管理员保存成功时只播放一次，并尊重系统减少动态设置；其余工作区不加持续动画。
- AC-09（`建议采纳`）：不在共享语义 CSS token 之外增加颜色字面量；现有 NativeWind、`react-native-svg`、Reanimated 和 `@expo/ui` 已足以实现本单元，不增加依赖。

## 验收方式

`A 人工验收`

## 涉及的当前事实

- [`../../specs/mobile-inspector.md`](../../specs/mobile-inspector.md)「登录与今日巡检」「记录」「通知」：更新店长 Tab 顺序与从通知打开详情的返回行为，业务能力和 API 不变。
- [`../../specs/mobile-admin.md`](../../specs/mobile-admin.md)「入口与配置」「审核与看板」「我的与通知」：更新管理员 Tab、默认入口、管理配置落点与通知入口位置，业务能力和 API 不变。
- [`../../context/design.md`](../../context/design.md)「方向与范围」「色彩」「导航与组件状态」「品牌与点缀」：保留 Web 方向及品牌资产，实现 Mobile 规范。

## 依赖

- FW-044：`docs/context/design.md`、`packages/tokens/tokens.css`、`apps/web/src/components/brand-mark.tsx`、`apps/web/src/components/console/empty-illustration.tsx`、`apps/web/src/components/console/review-score-ring.tsx`
- FW-037：`apps/mobile/components/mobile/notification-inbox-screen.tsx`

## 批准记录

- 批准依据：用户批准步骤一骨架，并于 2026-11-22 确认两张样板及店长继续按钮尺寸/位置，指令为「就这样吧，继续推进」。
- 批准时间：`2026-11-22`
- 特殊授权：无；仅修改 Mobile 前端、`docs/context/`、`docs/specs/` 与本工作单元文件，不增加依赖。
- 接力探针：不在接力线上。
