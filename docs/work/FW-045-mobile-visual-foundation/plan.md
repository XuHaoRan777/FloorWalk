# Mobile 视觉基础与样板页 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`archived`
- 当前任务：已完成
- 阻塞：无
- 下一步：无

预检：仅改 Mobile、Mobile 对应视觉规范和本工作单元文档，不动 API、共享契约、配置或数据库。开始前确认 3018/3019/3020 的归属，使用 `proc.mjs` 槽位管理本单元 API/Metro；Android AVD `Medium_Phone_API_37.0` 可用。

## 任务表

| ID | 任务 | 状态 | 交付的 AC 与证据 |
| --- | --- | --- | --- |
| T01 | Mobile 交互状态、页面框架与品牌规则 | `done` | AC-01、AC-08、AC-09 |
| T02 | 店长今日首页和底栏 | `done` | AC-02、AC-03、AC-06、AC-07 |
| T03 | 管理员导航、首页和模板编辑样板 | `done` | AC-03、AC-04、AC-05、AC-07 |
| T04 | 样板路径、原生尺寸、机器门与数据无回归 | `done` | AC-01 至 AC-09 |
| T05 | 最终代码审查 | `done` | AC-01 至 AC-09 |

## 证据

| 任务 | status | command | artifact | 备注 |
| --- | --- | --- | --- | --- |
| T01 | `passed` | `node packages/tokens/generate-native.mjs --check` | `docs/context/mobile-design.md` | Native token 仅由共享 tokens 生成；品牌使用 react-native-svg。 |
| T02 | `passed` | Android SDK 37 模拟器、Expo Go 58.0.5；390/360 dp 真机节点边界与截图 | `.visual/step2/android-manager-tasks-390.png`；`.visual/step2/android-manager-tasks-360.png`；`.visual/step2/android-manager-task-detail-390.png`；`.visual/step2/android-manager-task-detail-360.png` | 当日隔离日程产生一条实际任务，续办按钮居中且进入详情；任务详情内返回和 Android 返回键均回到今日。续办按钮原生可见区域为 280×48 dp。临时日程与门店关联已清理。 |
| T03 | `passed` | Android SDK 37 模拟器、Expo Go 58.0.5；390/360 dp 页面与键盘状态实测 | `.visual/step2/android-admin-today-390.png`；`.visual/step2/android-admin-management-390.png`；`.visual/step2/android-admin-template-edit-390.png`；`.visual/step2/android-admin-template-edit-360.png`；`.visual/step2/android-admin-template-keyboard-390.png`；`.visual/step2/android-admin-template-keyboard-360.png` | 验证登录后进入今日、底栏五项、管理配置六项、模板表单固定保存/取消；软键盘弹出时保存/取消保持可见并隐藏底部 Tab。 |
| T04 | `passed` | Android 样板人工验收；`$env:FW_SLOT='3'; pnpm e2e:mobile`（43 项通过）；`pnpm --filter @apps/mobile typecheck`；`pnpm lint`；`pnpm format:check`；`pnpm --filter @apps/mobile build`；`python scripts/validate_docs.py`；token `--check`；`git diff --check` | `.visual/step2/` | 用户于 2026-11-23 确认「确认，继续」。Android bundle 导出成功，文档和 token 生成一致；全量 Mobile 测试覆盖新增管理员通知返回路径。Expo Web e2e 仅作为自动化回归，不代替 Android 原生截图。 |
| T05 | `passed` | 独立 Subagent 审查；修复 finding 后仅复核该项 | `docs/howto/final-review.md` | 独立 Subagent 要求补管理员从人工审核通知进详情后返回收件箱测试；已在通知 e2e 补测并经独立定向复核关闭。 |

## 交接

- 和讨论时不一样的：软键盘弹出时隐藏管理员底部 Tab，并维持模板编辑的固定操作区；店长续办按钮按你确认的居中、加长落实为 280×48 dp。
- 需要你测的：已于 2026-11-23 通过「确认，继续」完成 Android 样板验收。截图为 SDK 37 模拟器运行 SDK 58 Expo Go，不代表其他 Android/iOS 设备。

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| --- | --- | --- | --- |

## 决策与偏差

| 日期 | 决策或偏差 |
| --- | --- |
| 2026-11-22 | 样板为店长「今日待巡」和管理员「模板编辑」。品牌/通知固定栏只出现在角色首页，子页面标题与返回随正文滚动。任务继续按钮居中、加宽，不铺满页面。 |
| 2026-11-23 | Android 原生走查发现软键盘遮住模板固定操作区；在固定操作区场景应用键盘高度收缩，并在管理员 Tab 配置键盘显示时隐藏导航。原生模拟器确认 360/390 dp 下保存/取消可见。 |
