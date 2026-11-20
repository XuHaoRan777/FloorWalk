# Web 控制台设计基线

本文件记录 FW-041 已落地的 Web 视觉取值与用法。后续 Web 视觉单元以本文件和 `packages/tokens/tokens.css` 为准；共享系统事实见 [工程骨架](../specs/workspace.md#共享设计系统)。

## 方向与范围

Web 控制台采用方向 01「钴蓝运营台」。紧凑分组导航、清楚的周期与统计层次适合管理员在桌面反复查看门店状态；钴蓝、青绿和告警色分别承载品牌操作、辅助数据与风险状态，轻量阴影和小圆角区分工作表面。

本单元完成总部看板与模板编辑两张样板页。只使用浅色底，不提供主题切换，不按商家更换颜色。Mobile 页面样式不在 FW-041 范围内，Native token 映射仍由 `packages/tokens/generate-native.mjs` 从共享 CSS token 生成。

## 色彩

颜色变量只在 `packages/tokens/tokens.css` 定义。Web 页面通过 Tailwind 语义类或 `--fw-*` 变量消费；组件样式可以使用基于语义变量的 `color-mix()` 形成悬停、描边和轻底色，不自行引入颜色字面量。

| 用途                   | 变量                                           | 实际值                          |
| ---------------------- | ---------------------------------------------- | ------------------------------- |
| 画布                   | `--fw-background`, `--fw-ground`               | `#f2f5fb`                       |
| 卡片、浮层             | `--fw-card`, `--fw-surface`, `--fw-popover`    | `#ffffff`                       |
| 前景                   | `--fw-foreground`                              | `#202944`                       |
| 次级内容               | `--fw-muted-foreground`                        | `#616f88`                       |
| 提升表面               | `--fw-secondary`, `--fw-raised`                | `#edf2ff`                       |
| 当前项                 | `--fw-active`                                  | `#eaf0ff`                       |
| 描边、控件描边、分隔线 | `--fw-border`, `--fw-input`, `--fw-rule`       | `#e0e6f0`, `#cbd5e4`, `#e8edf4` |
| 品牌                   | `--fw-primary`, `--fw-ring`                    | `#365de8`                       |
| 辅助                   | `--fw-accent`                                  | `#058d84`                       |
| 成功                   | `--fw-success`, `--fw-positive-background`     | `#178567`, `#e1f5f2`            |
| 警告                   | `--fw-warning`, `--fw-warning-background`      | `#bc750e`, `#fff5df`            |
| 危险                   | `--fw-destructive`, `--fw-negative-background` | `#c63f51`, `#fff0f2`            |
| 中性状态底色           | `--fw-neutral-background`                      | `#edf0f6`                       |
| 图表系列 1 / 2 / 3     | `--fw-chart-1`, `--fw-chart-2`, `--fw-chart-3` | `#365de8`, `#058d84`, `#bc750e` |
| 遮罩                   | `--fw-overlay`                                 | 前景色 `46%` 混合透明色         |

状态同时使用文字或图标表达，不仅依赖颜色。通过状态用成功色，不合格状态用危险色，待审核或审核中使用品牌色，中性状态保留中性色。

## 字体与尺寸

Web 页面正文使用 `--fw-font-web-sans`，值为 `'Segoe UI', 'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif`。中文回退显式覆盖 Windows 与 macOS 的无衬线字体。Web 的 `theme.css` 将 Tailwind 的 `font-sans` 和 `font-display` 都映射到该变量。共享默认字体 `--fw-font-sans` 与 `--fw-font-display` 保留 `'IBM Plex Sans', Inter, system-ui, sans-serif`，Native 生成器按现有 IBM Plex 注册名映射。数字使用等宽数字，日志或技术标识可使用 `--fw-font-mono`（IBM Plex Mono）。

字号变量从小到大为 `--fw-text-xs` `12px`、`--fw-text-sm` `14px`、`--fw-text-base` `16px`、`--fw-text-lg` `18px`、`--fw-text-xl` `20px`、`--fw-text-2xl` `22px`、`--fw-text-3xl` `28px`。页面标题用 `2xl`，区块标题用 `base` 或 `lg`，字段和表格正文用 `sm`，辅助说明用 `xs`。

间距基准 `--fw-space-unit` 为 `4px`；`xs/sm/md/lg/xl/xxl` 分别为 `4/8/16/24/32/48px`。页面与组件优先使用对应 `--fw-space-*` token，不重复声明相似的局部间距尺度。

## 表面、圆角与阴影

控制件圆角 `--fw-radius-control` 为 `5px`，卡片 `--fw-radius-card` 为 `7px`，独立浮层 `--fw-radius-sheet` 为 `8px`。数据卡片、列表和表格外框使用卡片圆角，输入、按钮和小型状态标签使用控制件圆角。

| 层级           | 变量             | 阴影                                                   |
| -------------- | ---------------- | ------------------------------------------------------ |
| 贴面卡片与导航 | `--fw-shadow-xs` | `0 1px 2px` 前景色 `4%`，加描边色 `60%` 的 `1px` 轮廓  |
| 编辑面板与悬停 | `--fw-shadow-sm` | `0 4px 12px` 前景色 `7%`，加 `0 1px 2px` 前景色 `4%`   |
| 弹出层与模态层 | `--fw-shadow-md` | `0 12px 30px` 前景色 `13%`，加 `0 3px 8px` 前景色 `7%` |

页面底层使用画布色，导航与固定顶栏使用卡片表面，卡片通过描边和浅阴影与画布分离，弹出层和模态层使用浮层变量及中层阴影。避免连续叠放卡片，页面主区域保持平面布局。

## 导航与组件状态

桌面控制台使用左侧分组导航、固定顶栏和可滚动的主内容区。当前导航项用淡品牌底色和侧边品牌标记；内容区按标题、操作、指标或表单、数据表的顺序组织。窄桌面将指标改为双列，模板列表与编辑区在可用宽度不足时纵向排列。

按钮、侧栏项、表单控件、模板列表行和浮层都应保留以下状态：

- 默认状态以语义变量提供可读文字、表面和描边。
- 悬停状态提供底色、描边或阴影变化，并使用 `--fw-motion-fast`。
- 键盘聚焦使用 `--fw-ring` 外轮廓，不能仅依赖悬停。
- 禁用状态降低强调度并阻止操作；保存中时表单控件禁用并显示状态文字。
- 加载状态使用可访问的 `role="status"` 和明确文案；空状态使用图标与说明文字；错误状态使用 `role="alert"` 和危险语义色。

表格保留列标题与数字对齐，关键判定状态使用文字标签和语义底色。看板统计周期与统计维度是分开的控制组，门店、店长和日期统计视图互斥。

模板编辑的保存操作区固定在当前编辑区域的可视底部，首屏与滚动编辑时均可找到；使用卡片底色和分隔描边，与输入内容保持边界。

## 动效与减少动态

| 变量                   | 时长 / 曲线                      | 用途                             |
| ---------------------- | -------------------------------- | -------------------------------- |
| `--fw-motion-fast`     | `120ms`                          | 按钮、输入和导航的短反馈         |
| `--fw-motion-normal`   | `180ms`                          | 面板展开、维度内容切换、列表变化 |
| `--fw-motion-slow`     | `340ms`                          | 看板指标数字淡入并轻微上移       |
| `--fw-motion-page`     | `180ms`                          | 页面 View Transition             |
| `--fw-ease-standard`   | `cubic-bezier(0.2, 0, 0, 1)`     | 通用状态切换                     |
| `--fw-ease-emphasized` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | 数字与列表进入                   |

列表结构变化使用浏览器 View Transitions API。模板检查项的截图与更新回调执行期间，表单、模板选择和模板页操作暂时禁用，回调完成即恢复，避免旧草稿覆盖当前编辑；结构更新基于最新列表状态。浏览器不支持时直接更新。`prefers-reduced-motion: reduce` 下取消动画与过渡，按下状态不位移。
