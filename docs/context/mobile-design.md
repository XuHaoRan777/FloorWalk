# Mobile 唯一视觉基线

本文件是 FloorWalk Mobile 的唯一视觉基线，定义 Mobile 专用 token、字体角色、公共组件状态和页面排版原则。设计源文件只存在本机 `.visual/design/`，不在仓库中，也不复制到仓库。排版与组件细节以本机 `b.css` 和 `components.html` 为准，七个店长页面以 `.visual/samples/r2/B/01-manager-today.html`、`02-manager-capture.html` 和 `.visual/design/pages/manager-records.html`、`manager-record-detail.html`、`manager-chat.html`、`manager-notifications.html`、`manager-profile.html` 为准。`.visual/` 只读，不入库。

FW-046 被否决的方向 A 不构成本基线。

## 品牌

品牌标记继续使用现有 `BrandMark` 资源，沿用已锁定的几何和颜色。Mobile 主色用于交互与状态，不替代品牌标记本身。

## Mobile token

Mobile 取值定义在 `packages/tokens/tokens.css` 的 `--fw-mobile-*` 变量中，通过 `node packages/tokens/generate-native.mjs` 生成到 `packages/tokens/native.json` 的 `mobile` 对象。通用 token 与 Web 取值保持现有值。

| 用途 | Native token | 值 |
| --- | --- | --- |
| 页面和表面 | `mobile.background`、`mobile.surface` | `#FFFFFF` |
| 正文与次级文字 | `mobile.foreground`、`mobile.mutedForeground` | `#1F1F1F`、`#595959` |
| 分隔线与输入框边界 | `mobile.border`、`mobile.input` | `#F0F0F0`、`#D9D9D9` |
| 品牌主色 | `mobile.primary`、`mobile.primaryPressed`、`mobile.primaryText` | `#1677FF`、`#0958D9`、`#0958D9` |
| 主色浅底 | `mobile.primarySoft`、`mobile.primaryTint` | `#E6F4FF`、`#E6F4FF` |
| 进行中和路线 | `mobile.route`、`mobile.routeStrong` | `#1677FF`、`#0958D9` |
| 成功 | `mobile.success`、`mobile.successText`、`mobile.successTint`、`mobile.successBackground` | `#52C41A`、`#389E0D`、`#F6FFED`、`#F6FFED` |
| 打回 | `mobile.warning`、`mobile.warningText`、`mobile.warningTint`、`mobile.warningBackground` | `#FAAD14`、`#D48806`、`#FFFBE6`、`#FFFBE6` |
| 逾期与不合格 | `mobile.danger`、`mobile.dangerText`、`mobile.dangerTint`、`mobile.dangerBackground` | `#FF4D4F`、`#CF1322`、`#FFF1F0`、`#FFF1F0` |
| 改判 | `mobile.change`、`mobile.changeText`、`mobile.changeTint` | `#722ED1`、`#531DAB`、`#F9F0FF` |
| 禁用 | `mobile.disabled`、`mobile.disabledForeground`、`mobile.disabledBackground` | `#BFBFBF`、`#8C8C8C`、`#F5F5F5` |
| 按下反馈与遮罩 | `mobile.pressedBackground`、`mobile.overlay` | `#E6F4FF`、`#1F1F1F` |

状态标签始终使用颜色、图标和文案共同表达。通过、进行中、打回、逾期、不合格、已改判、已提交和未开始对应组件定义中的语义状态。

| 尺度 | Token 与值 |
| --- | --- |
| 间距 | `mobileSpace` 以 4 dp 为单位，`xs=4`、`sm=8`、`md=12`、`lg=16`、`xl=20`、`xxl=24`、`xxxl=32`、`display=40` |
| 圆角 | `mobileRadius.control=10`、`primary=10`、`card=20`、`photo=16`、`large=24`、`pill=9999` |
| 字号 | `mobileType.xs=11`、`sm=12`、`base=14`、`lg=16`、`title=20`、`xl=20`、`2xl=24`、`display=30` dp |
| 卡片阴影 | `mobileShadow.card` 为 `0 2px 10px rgba(31, 31, 31, 0.06)` |
| 焦点阴影 | `mobileShadow.focus` 为 `0 0 0 3px rgba(22, 119, 255, 0.18)` |
| 最小触控尺寸 | 44 dp |

## 字体

采用 LXGW WenKai GB v1.530 Regular 上游 TTF，并用 3500 个常用汉字、数字、ASCII 与常用中英文标点截取子集。应用资源 `apps/mobile/assets/fonts/LXGWWenKaiGB-Regular.ttf` 为 1,735,448 字节，授权随附于 `apps/mobile/assets/fonts/LXGWWenKaiGB-OFL.txt`。`apps/mobile/app/_layout.tsx` 通过 `expo-font` 注册并加载 `LXGWWenKaiGB-Regular`。组件稿的 WOFF2 字体只用于本机设计预览，不加载进应用。

字体上游版本为 v1.530，Regular TTF 下载地址是 [LXGWWenKaiGB-Regular.ttf](https://github.com/lxgw/LxgwWenKaiGB/releases/download/v1.530/LXGWWenKaiGB-Regular.ttf)，许可证为 SIL Open Font License 1.1。仓库中的授权文件来自同版发布包。

子集字符表和 fontTools 4.68.0 临时安装目录留在本机 `.visual/design/.font-source/` 与 `.visual/design/.fonttools/`。字符表从 Jun Da 的现代汉字频率表中取常用汉字，再加 ASCII 和常用中英文标点。以下 PowerShell 命令从仓库根目录重建应用字体，输出与当前应用资源的 SHA-256 一致。

```powershell
$fw047PythonPath = (Resolve-Path '.visual/design/.fonttools').Path
$fw047PreviousPythonPath = $env:PYTHONPATH
try {
  $env:PYTHONPATH = $fw047PythonPath
  python -m fontTools.subset `
    '.visual/design/.font-source/LXGWWenKaiGB-Regular-v1.530.ttf' `
    '--text-file=.visual/design/.font-source/fw047-characters.txt' `
    '--output-file=apps/mobile/assets/fonts/LXGWWenKaiGB-Regular.ttf' `
    '--layout-features=*' `
    '--name-IDs=*' `
    '--name-languages=*'
} finally {
  $env:PYTHONPATH = $fw047PreviousPythonPath
}
```

页面标题、固定标签、状态文案、控件动作、日期与数字使用 LXGW WenKai GB。门店名、姓名、模板名、备注、验收要点、聊天文字和通知详情属于用户输入或接口内容，统一使用系统正文字体，避免子集没有覆盖用户数据时出现缺字。正文规则通过 `MobileText` 的 `body` 角色实现；其余固定标签、标题和数字按组件角色选择文楷。

## 公共组件

公共组件在 `apps/mobile/components/mobile/` 中实现，复用以上 Mobile token。实现状态按 `.visual/design/components.html` 对齐。

| 组件 | 视觉与状态 |
| --- | --- |
| 底部导航 `MobileBottomBar` | 店长顺序为「今日待巡、记录、通知、我的」，当前页使用主色图标、标签和选中底面。管理员保留现有独立导航结构。 |
| 顶部区 `MobileTopBar` | 支持标题、说明、品牌标记、返回与尾部操作。标题层级、按钮触控尺寸和安全区符合页面用途。 |
| 按钮 `MobileButton` | 主操作、次操作、危险操作、禁用与加载五态，并有按下和焦点反馈。禁用和加载期间不重复触发动作。 |
| 状态标记 `MobileStatusTag` | 状态色、图标和文字同时出现，不只用颜色传达状态。 |
| 任务行 `MobileTaskRow` | 按时间展示时刻、模板名、时间说明和状态，当前项与键盘焦点有独立视觉提示。 |
| 照片位 `MobilePhotoSlot` | 已拍、空位、上传中和失败四态。失败态提供重试入口，空位文字说明拍摄动作。 |
| 输入框 `MobileTextField` | 固定标签、系统正文输入、占位文字、聚焦与禁用状态，支持多行备注。 |
| 列表行 `MobileListRow` | 主标题、可选说明和尾部状态或操作按层级排列，用户输入内容允许换行或省略。 |
| 卡片 `MobileSurfaceCard` | 白色表面、浅分隔边界和轻阴影用于独立信息组。列表主要以分隔线组织。 |
| 空状态 `MobileEmptyState` | 图标、标题、说明和可选下一步并列，内容区留白稳定。 |

## 页面排版

- Mobile 页面画布为白色，页面边距通常为 16 dp，分组使用轻分隔线或浅色表面。
- 品牌蓝用于主要动作、焦点和当前位置。成功、打回、危险、改判与未开始分别使用各自语义状态。
- 交互对象的触控区域至少为 44×44 dp。按下反馈不移动布局，键盘焦点保持清晰。
- 可滚动页面处理顶部和底部系统安全区。底栏保留系统手势区，键盘打开时主要输入和发送操作仍可触达。
- 标题与固定操作使用固定字号层级。用户输入和接口返回的长文本使用系统正文字体，并截断或换行，避免撑破横向布局。
- 任务详情的店长自评选项按标签自然宽度显示，并保持至少 44 dp 的触控高度，不拉伸占满剩余横向空间。
- 图片、照片说明和消息正文适配现有字段。设计稿使用的图库图片只留在 `.visual/`，应用、测试和取证使用合成照片。

## 数据边界

设计稿里没有现有接口字段的内容不展示，不构造本地草稿、模板照片、巡检人姓名、聊天关联模板名或审核事件。已有接口字段按页面层级组织和展示；业务请求、权限、取数与提交语义仍以 `docs/specs/` 对应章节为准。

`.visual/` 下的设计 HTML、CSS、图库照片、原始字体、字符表和截取工具都只在本机保留，不入库。
