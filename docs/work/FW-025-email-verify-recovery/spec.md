# 注册邮箱验证与管理员找回密码

> ID：`FW-025`
>
> 状态：`approved`

## 目标

接力线一第 2 个。注册商家时先用邮箱验证码验证管理员邮箱；管理员忘记密码时用邮箱验证码重设。邮件走可替换的驱动：e2e 用假驱动，真实环境用 Resend 模板 `verification-code` 发送。

## 非目标

- 不做店长找回密码（由管理员重置）、短信。
- 真实发信不在本单元验收（线尾单独的方式 A 单元）；本单元只保证 Resend 驱动按配置可构造、模板请求参数有单元测试。
- 不做验证码以外的邮件（通知不发邮件）。

## 验收标准

认证相关，失败路径全部由 API 测试取证。

- AC-01（`用户要求`）：邮件驱动由 `MAIL_DRIVER` 配置选择：假驱动把收件人、主题、验证码写入可被测试读取的位置；Resend 驱动从配置读取 `MAIL_FROM_ADDRESS`、`RESEND_API_KEY` 与 `RESEND_TEMPLATE_ID`，发送模板 `verification-code`，变量包含 `APP_NAME`、`CODE`、`EXPIRES_IN`；发件地址为 `FloorWalk <no-reply@mail.codexu-studio.com>`。单元测试校验 Resend 模板请求参数，不发真实请求。配置键在 `apps/api/.env.development.example` 与 `apps/api/.env.production.example` 登记属性注释。
- AC-02（`用户要求`）：注册：先 `POST` 请求注册验证码（邮箱），再带验证码提交注册；验证码错、过期都 400，注册不成功。同一邮箱可以注册多个商家。
- AC-03（`用户要求`）：验证码 5 分钟过期；同一邮箱同一用途 60 秒内重发返回 429；同一验证码输错 5 次作废，第 6 次即使正确也 400，需要重新获取；不锁账号。过期与重发间隔用改库或注入时钟取证，不等真实时间。
- AC-04（`用户要求`）：找回密码只对 admin：请求找回验证码时，邮箱不是任何商家的 admin 也返回同样的成功响应且不发信（不泄露账号是否存在）。验证码通过后，若该邮箱在多个商家是 admin，返回商家列表供选择；设新密码（≥8 位）后吊销该账号全部会话，`must_change_password` 为假。
- AC-05（`建议采纳`）：验证码只存哈希，响应和日志里不出现明文（假驱动的测试出口除外）。
- AC-06（`用户要求`）：Web 注册页加发送验证码与倒计时；Web 与 Mobile 登录页有「忘记密码」入口（Mobile 只给管理员用，店长输入登录名后提示联系管理员重置）。界面 e2e 用假驱动走通注册与找回。

## 验收方式

`B Agent 验收`

- 改 schema、迁移、`auth.ts`，提交带「硬线：」行。

## 涉及的当前事实

- [`specs/inspection.md`](../../specs/inspection.md)「契约与权限」「接口」「数据结构」：注册验证码、找回密码。
- [`specs/web-console.md`](../../specs/web-console.md)：注册页、忘记密码。
- [`specs/mobile-inspector.md`](../../specs/mobile-inspector.md)「登录与今日巡检」：忘记密码入口。
- [`specs/workspace.md`](../../specs/workspace.md)：邮件驱动与配置键。

## 依赖

- FW-024

## 批准记录

- 批准依据：用户 2026-11-09 原话"批准"（线一 FW-024～FW-029 一起批准）；同条答复：active 上限改 6 同意、Codex 桌面版接力、授权线内本地提交、开发库与 e2e 槽位可以重置、本地配置由用户手动核对\
- 批准时间：`2026-11-09`\
- 特殊授权：线内本地提交（不推送）；FW-024 重置开发库与全部 e2e 槽位；`active-units-max` 临时 6，线一归档后改回 3\
- 接力探针：`2026-11-09`：commit-msg 钩子用样例提交信息直接执行通过（exit 0）；执行器为 Codex 桌面版（`create_thread` 默认弹审批，由用户点）；改为用户手动的：本地配置核对（`--env-keys` 报无可检查配置）；commit-msg 钩子同日由用户授权启用（`core.hooksPath scripts/hooks`），改到 hardline 路径缺「硬线：」行的提交会被拒
