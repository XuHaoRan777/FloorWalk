# Mobile 店长端页面与视觉基础

> ID：`FW-047`
>
> 状态：`approved`

## 目标

按用户确认的本机设计稿完成 Mobile 店长端 7 个页面并建立可复用的 Mobile 视觉基础。
重写 `docs/context/mobile-design.md`，作为 Mobile 唯一视觉基线。
只改变 Mobile 的视觉呈现，保留业务逻辑与数据契约。

## 非目标

- 不修改 Web 页面、样式、tokens 取值或 Logo。
- 不修改 API、取数方式、权限、服务端规则、共享业务类型、数据库或接口字段。
- 设计稿中没有接口字段的数据不做，记入本单元「决策与偏差」。
- 不新增行为测试。因布局或组件变化失效的选择器、导航结构断言允许调整，并逐项记录。
- 不删除 `__design-samples` 路由，该项归 Backlog 第 4 项。
- 不复制设计稿 HTML/CSS、页面或图库照片进仓库。按 AC-03 从上游字体发布版截取 TTF，并将 TTF 与 OFL 授权作为应用字体资源加入 Mobile。

## 设计来源

唯一视觉依据是本机只读文件：`.visual/design/b.css`、`.visual/design/components.html`、`.visual/design/index.html`、`.visual/samples/r2/B/01-manager-today.html`、`.visual/samples/r2/B/02-manager-capture.html`、`.visual/design/pages/manager-records.html`、`.visual/design/pages/manager-record-detail.html`、`.visual/design/pages/manager-chat.html`、`.visual/design/pages/manager-notifications.html`、`.visual/design/pages/manager-profile.html`。`.visual/design/notes.md` 中「想要但接口没有的」所列内容均不实现。`.visual/` 不入库。`docs/context/mobile-design.md` 要说明设计稿只在本机、不在仓库。

## 验收标准

- AC-01（用户要求）：按 `.visual/design/b.css` 重写 `packages/tokens` 中 Mobile 专用取值，并通过现有 native 生成流程生效。Native 生成值与样式源一致；Web token 名称和值逐项不变，Logo 不改。
- AC-02（用户要求）：在 `apps/mobile` 建立公共组件，覆盖底栏、顶部区、按钮五态、状态标记、任务行、照片位四态、输入框、列表行、卡片和空状态，外观遵循 `.visual/design/components.html`。
- AC-03（用户要求）：从 LXGW WenKai GB v1.530 上游发布版 Regular TTF 截取 3500 个常用汉字，并补充 ASCII 字符及常用中英文标点，使用 `expo-font` 加载截取后的 TTF。版本、下载地址和可复现截取命令写入 `docs/context/mobile-design.md` 字体一节。应用字体 TTF 实测 1,735,448 字节（1,694.77 KiB）。OFL 授权文件随字体保留。页面标题、固定标签和数字使用文楷；门店名、姓名、备注等用户输入内容使用系统字体。临时字体、字符频率表和截取工具文件只留在 `.visual/`，不入库。
- AC-04（用户要求）：`/today` 按 `.visual/samples/r2/B/01-manager-today.html` 还原。
- AC-05（用户要求）：`/inspection/[id]` 按 `.visual/samples/r2/B/02-manager-capture.html` 还原。修复已知 React Native Web `Unexpected text node` 问题；超长门店名和模板名截断或换行，不撑破布局。
- AC-06（用户要求）：`/records` 按 `.visual/design/pages/manager-records.html` 还原。
- AC-07（用户要求）：记录详情按 `.visual/design/pages/manager-record-detail.html` 还原；超长门店名和模板名截断或换行，不撑破布局。
- AC-08（用户要求）：聊天页按 `.visual/design/pages/manager-chat.html` 还原。
- AC-09（用户要求）：通知页按 `.visual/design/pages/manager-notifications.html` 还原。
- AC-10（用户要求）：我的页面按 `.visual/design/pages/manager-profile.html` 还原；超长门店名和姓名截断或换行，不撑破布局。
- AC-11（用户要求）：按 `.visual/design/b.css` 与 `.visual/design/components.html` 重写 `docs/context/mobile-design.md` 为 Mobile 唯一视觉基线。说明设计稿只存在本机 `.visual/design/`、不在仓库；不保留 FW-046 已否决的方向 A 为现行规则。
- AC-12（用户要求）：以上 7 页均在 Expo Web 390×844 下与设计稿并排对照，每页一张截图放于 `docs/work/FW-047-mobile-manager-visual-foundation/evidence/`。逐页列出视觉差异，每项要么修正、要么写明理由。截图只在取证时采集。测试和取证仅用合成照片，不复制图库照片。
- AC-13（用户要求）：Mobile 类型检查、ESLint、全量 Mobile E2E 通过。Web E2E 与开单前基线完全相同：40 项中 34 项通过、5 项失败、1 项跳过，失败项逐项相同。开单前命令 `$env:FW_SLOT = '3'; pnpm exec playwright test --config=playwright.web.config.ts`，退出码 1。基线失败为 `tests/web/console.spec.ts`「管理员进入审核队列，店长 Web 端只显示手机端提示」（退出按钮定位超时）、同文件「会话 ID 不暴露给脚本，刷新保持登录，退出后失效」（退出按钮定位超时）、`tests/web/orgs.spec.ts`「Web 注册与管理员密码找回」（退出按钮定位超时）、`tests/web/ui-foundation.spec.ts`「登录后五屏三宽截图」（焦点轮廓实际 1px，断言至少 2px）、`tests/web/users.spec.ts`「管理员创建店长并完成首次改密」（超时）。产物在 `tests/web-results/slot-3/`。
- AC-14（用户要求）：所有非原生调试先在 Expo Web 完成。最后仅在 Android 模拟器走查原生特有的系统返回、安全区、相机调起和键盘遮挡，并记录结果。

## 执行约束

AC-13 的 Mobile 类型检查、ESLint、全量 Mobile E2E 和 Web E2E 基线比对均登记为 `scripts/workflow.conf` 机器门，之后 Mobile 页面单元及归档门使用同一组门。先验证每个门能够独立复现其命令、槽位和 Web 基线比较。若某项受 `gate.py` 仅按命令退出码判断的限制，不能通过配置直接登记，则由门调用专用 runner，并在「决策与偏差」说明该限制。任务表每个任务记录 Asia/Shanghai 开始和结束时分。页面截图每页一张且只在取证时采集。验收方式 A，Agent 完成机器检查和代码审查后由用户现场确认模拟器路径。

## 结构与契约

- `apps/mobile/assets/fonts/LXGWWenKaiGB-Regular.ttf` 及 OFL 授权文件作为应用内字体资源，TTF 体积 1,735,448 字节（AC-03）。
- `scripts/workflow.conf` 中登记 Mobile 类型检查、Mobile ESLint、全量 Mobile E2E 与 Web 基线比较机器门；若 Web 比较需 runner，仅增加该专用脚本，不另建统一检查脚本（AC-13）。
- 不新增 API、共享业务类型、数据库结构、权限规则、服务端行为或环境变量。

## 涉及的当前事实

- `specs/mobile-inspector.md`「登录与今日巡检」：今日页、任务详情显示事实及代码路径。
- `specs/mobile-inspector.md`「记录」：记录列表与只读详情代码路径。
- `specs/mobile-inspector.md`「通知」：店长通知入口代码路径。
- `specs/chat.md`「数据契约（归档时再生成）」：Mobile 聊天代码路径。
- `specs/notifications.md`「数据契约（归档时再生成）」：Mobile 通知代码路径。

## 依赖

- 无

## 批准记录

- 批准依据：用户原话「FW-047 改完字体和检查入口两处后批准」
- 批准时间：2026-11-25
- 特殊授权：无；用户本次明确要求开立本单元
- 归档产物：无
- 接力探针：不在接力线上，删除本行
