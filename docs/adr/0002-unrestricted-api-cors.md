# 0002. API 接受任意跨域来源

- 状态：`accepted`
- 日期：`2026-10-29`
- 来源工作单元：`-`
- 取代：`-`

## 背景

API 使用 HttpOnly 会话 Cookie。Origin 白名单既限制浏览器跨域调用，也在写请求上承担来源校验；它妨碍用户要求的任意来源 API 访问。

## 决策

- API 对请求 Origin 回显 CORS 响应头并允许 credentials。
- 不再按 Origin 白名单拒绝写请求。
- 该行为是用户明确确认的产品决定；`SameSite=Strict` Cookie 属性保持不变。

## 后果

浏览器来源可以读取带凭据 API 的响应并发起写请求。同站不可信来源可代表已登录用户操作；`SameSite=Strict` 只限制跨站 Cookie 发送，不能代替来源授权。若后续需要限制调用者，应另行定义明确的来源策略与 CSRF 防护。

## 被否决的方案及原因

- 保留来源白名单：不符合用户要求的任意来源访问。
- CORS 使用 `Access-Control-Allow-Origin: *` 并允许 credentials：浏览器不接受带凭据请求使用通配 Origin。
