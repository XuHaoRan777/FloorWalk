# 巡检单聊天

> ID：`FW-012`
>
> 状态：`approved`

## 目标

并行组 g02 的并行单元（槽位 1，[`howto/parallel.md`](../../howto/parallel.md) 第 3 节）。
店员（本店单）和主管能在巡检单上发文字和图片，对方 2 秒内看到；总部只能看。Mobile 巡检页、Mobile 记录详情、Web 审核详情三处的聊天面板，从 FW-011 的简陋版做成可用版。

## 非目标

- 不做实时推送、已读未读、通知、消息编辑与删除。
- 不改契约、`schema.ts`、迁移、任何 `package.json`，不加依赖；不改聊天面板的挂载处（`inspection-screen.tsx`、`review-detail.tsx`、`records/[id].tsx`）。界面需要的字段契约里没有，停下报告（parallel.md 第 5 节）。

## 验收标准

界面 e2e 连本槽位起的真 API（聊天接口在 FW-011 已完整实现）。断言对照同一时刻 API 的返回，不写死条数。

- AC-01（`用户要求`）：面板打开时拉最近 50 条，按时间升序显示作者名、角色、时间、文字和图片；往上翻到顶时显示「加载更早」，点了用 `before` 取更早的 50 条，插在上面且滚动位置不跳；没有更早时不显示该按钮。
- AC-02（`用户要求`）：面板可见时每 2 秒用 `after=<最后一条 seq>` 拉新消息，追加到底部；已显示的消息和图片不重新加载、不闪烁。另一个账号经 API 发的消息，在 Web 和 Expo Web 上都能在 5 秒内出现，不用刷新。
- AC-03（`用户要求`）：面板不可见时停止轮询：Web 标签页隐藏（`visibilitychange`）、Mobile App 转后台（`AppState`）或页面失去焦点后，不再请求 `/messages`；回到前台立即补拉一次再恢复轮询。e2e 用请求计数断言。
- AC-04（`用户要求`）：发文字：1～1000 字，超过 1000 字时发送按钮禁用并提示；发送中按钮禁用防重复提交；成功后清空输入框、消息出现在底部；失败时保留输入内容并显示中文错误，可重试。
- AC-05（`用户要求`）：发图：Web 选文件、Mobile 从系统相册选图，可单独发图或图文一起发；jpeg/png、10MB 以内，超出时在前端提示不发送；图片在列表里能显示。图片签名地址过期加载失败时，用 `GET /api/messages/:id/image-url` 重取一次。
- AC-06（`用户要求`）：权限：总部在 Web 审核详情能看聊天，没有输入框和发送按钮；店员、主管能发；单子在任何状态（含已通过、不合格）都能发。API 测试覆盖总部发 403、外店店员发 403、外店店员读 403，以及结束状态的单仍能发。
- AC-07（`用户要求`）：Mobile 原生：模拟器上 Expo Go 在巡检页发一条文字、一张相册图，Web 主管 5 秒内看到且图能显示；Web 主管回一条，Mobile 不重开页面 5 秒内看到。logcat 无 JS 错误。转后台停止轮询由 AC-03 在 Expo Web 上取证，原生端不重复取证。
- AC-08（`用户要求`）：网络错误和接口错误（401、403、409、422）都显示可读的中文提示；轮询中途网络断开不弹重复错误，恢复后自动补拉。

## 验收方式

`B Agent 验收`

- API 测试放 `apps/api/src/chat.test.ts`，Web e2e 放 `tests/web/chat.spec.ts`，Mobile e2e 放 `tests/mobile/chat.spec.ts`，不改已有测试文件（预授权的定位修正除外）。
- 模拟器取证照 [`dev-environment.md`](../../context/dev-environment.md)「Mobile 原生」一行。本组只有本单元用模拟器。

## 涉及的当前事实

- 拟新增 `specs/chat.md`：聊天的权限、轮询与分页、发图规则。由集成单元 FW-015 归档时 Promote。
- [`specs/web-console.md`](../../specs/web-console.md)「主管审核」「总部看板」：审核详情有聊天，总部只读。由 FW-015 统一 Promote。
- [`specs/mobile-inspector.md`](../../specs/mobile-inspector.md)「补交」：巡检页有聊天。由 FW-015 统一 Promote。

## 依赖

- FW-011

## 批准记录

- 批准依据：用户 2026-10-29 四个单元一起批准（原话"四个单元一起批准。提交推送，告诉我补 env 和打 g02/start 的步骤，再给我三条并行启动语。"）；产品决定与默认见 FW-011 plan「决策与偏差」
- 批准时间：`2026-10-29`
- 特殊授权：并行组 g02，写入范围：`apps/api/src/chat.controller.ts`、`apps/api/src/chat.test.ts`、`apps/web/src/components/console/chat-panel.tsx`、`apps/web/src/lib/api/chat.ts`、`apps/mobile/components/mobile/chat-panel.tsx`、`apps/mobile/lib/api/chat.ts`、`tests/web/chat.spec.ts`、`tests/mobile/chat.spec.ts`，可在这些文件旁新建只被它们引用的文件；在本分支 `g02/FW-012` 本地提交，不推送；只用 `floorwalk` 角色连 `floorwalk_e2e_1`。预授权：FW-011 写的测试或演示链漏了步骤，可在本分支补，不算契约改动；原有的不稳定测试只许改定位、不许放宽断言，改动在证据里写明。
