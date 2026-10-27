# 会话改为 HttpOnly cookie 与服务端会话表

> ID：`FW-009`
>
> 状态：`approved`

## 目标

Web 与 Mobile 登录后，会话只存在 HttpOnly cookie 里，脚本读不到；cookie 里是服务端会话表的会话 ID，退出或吊销后立即失效。`localStorage` 与 SecureStore 都不再保存 token（[`specs/web-console.md`](../../specs/web-console.md)「没有的」记录的 XSS 风险）。Web 构建产物加 CSP。
本单元同时是 g02 之前的第二个串行基线，按 [试行记录](../../parallel-trial.md)「值不值」的口径分类记人工触点。

## 非目标

- 不支持 Web 与 API 跨站点部署（不同可注册域名）：那需要 `SameSite=None; Secure` 加 CSRF token，另开单元。本单元假设同站点（同一可注册域名下的子域、反向代理同源，或本机 127.0.0.1 的不同端口）。
- 不做滑动续期和刷新 token；会话有效期固定 1 小时。
- 不做"查看与管理我的登录设备"界面，不做踢下线界面。
- 不改除认证外其他接口的请求、响应和权限。

## 验收标准

术语：「会话」指 `floorwalk.sessions` 的一行；「会话 cookie」指 `fw_session`，值是会话 ID 原文，表里只存它的 SHA-256。

- AC-01（`建议采纳`）：新增表 `floorwalk.sessions`：`id`（uuid 主键）、`token_hash`（唯一）、`user_id`（外键，用户删除时级联删除）、`created_at`、`expires_at`、`revoked_at`（可空），`user_id` 上有索引。一次迁移建好；种子重置时一起清空。表结构写进 `docs/specs/inspection.md`「数据结构」。
- AC-02（`用户要求`）：契约新增 `POST /api/auth/session`（请求同 `loginRequestSchema`，成功 201，响应体只有 `{ user }`，不含任何凭据）和 `DELETE /api/auth/session`（成功 204，不要求已登录）；路由定义的 method、successStatus 类型按需扩展。契约 e2e 按路由表覆盖这两条。
- AC-03（`用户要求`）：`POST /api/auth/session` 登录成功时生成 32 字节随机会话 ID，写入会话表（`expires_at` = 现在 + 1 小时），设 cookie `fw_session`：`HttpOnly; SameSite=Strict; Path=/api; Max-Age=3600`，`NODE_ENV=production` 时另加 `Secure`。密码错误返回 401、不写会话表、不设 cookie。API 测试从响应头断言属性，并断言开发环境无 `Secure`、生产环境有。
- AC-04（`用户要求`）：`AuthGuard` 只认会话 cookie：按 `token_hash` 查会话，未吊销、未过期、用户仍存在且角色有效才通过。无 cookie、会话 ID 不存在、已过期、已吊销、用户已删除各返回 401 `UNAUTHENTICATED`，每种一条 API 测试。`Authorization: Bearer` 头不再被接受，带它的请求按无 cookie 处理（401），一条测试。
- AC-05（`建议采纳`）：`DELETE /api/auth/session` 把当前会话标记吊销并清 cookie；吊销后用同一个会话 ID 原文（测试里保留的副本）请求 `/api/me` 返回 401。用户删除后其全部会话失效。测试各一条。
- AC-06（`用户要求`）：旧的 `POST /api/auth/login` 与 JWT 签发移除，契约路由表和 `loginResponseSchema` 去掉 token 字段；`/api/auth/login` 返回 404。照片签名链接仍用 `JWT_SECRET` 做 HMAC，行为不变。
- AC-07（`用户要求`）：CSRF：会话 cookie 认证的 `POST`/`PATCH`/`DELETE` 请求，带 `Origin` 头且不在 CORS 白名单时返回 403 `FORBIDDEN`，不执行操作；不带 `Origin` 时放行（浏览器的跨站点写请求总会带 Origin，Mobile 原生请求不带）。`POST`/`DELETE /api/auth/session` 同样检查。API 测试覆盖：白名单 Origin 通过、外来 Origin 403、无 Origin 通过；照片上传（multipart）的外来 Origin 403 单独一条。
- AC-08（`用户要求`）：CORS 开 `credentials: true`，白名单仍来自 `CORS_ORIGINS` 或现有默认列表。`e2e:cors` 改为：从 Web 槽位源带 credentials 登录后读 `/api/me` 成功；从不在白名单的源发起时浏览器拿不到响应。
- AC-09（`用户要求`）：Web 改用 `/api/auth/session` 登录、`DELETE /api/auth/session` 退出，所有请求 `credentials: 'include'`，不设 `Authorization` 头，组件和 API 函数不再传 token。打开页面时调一次 `GET /api/me` 决定进哪个角色的页面，401 回登录页，加载期间显示加载状态。首次加载时删除旧的 `floorwalk.session`。照片仍能显示。
- AC-10（`用户要求`）：Web e2e 断言：登录后 `localStorage` 与 `sessionStorage` 里没有任何值包含会话 ID；`document.cookie` 不含 `fw_session`；刷新页面仍保持登录；退出后 `/api/me` 返回 401、页面回到登录页；任意接口 401 时回登录页；主管进审核队列、总部进看板且没有审核按钮、店员看到"请使用手机端"，与现在一致。
- AC-11（`建议采纳`）：Mobile 改用 `/api/auth/session` 登录、`DELETE /api/auth/session` 退出，请求 `credentials: 'include'`，不设 `Authorization` 头，组件和 API 函数不再传 token；删除 `lib/storage.ts` 的 token 读写，首次启动时删除 SecureStore 与 `localStorage` 里旧的 `floorwalk.auth.token`。启动时调一次 `GET /api/me` 决定进今日待巡还是登录页。原生端会话 cookie 由系统的 cookie 存储保存（Android 走 React Native 的 `ForwardingCookieHandler`）。
- AC-12（`建议采纳`）：Mobile e2e（Expo Web）断言：登录后 `localStorage` 不含会话 ID，`document.cookie` 不含 `fw_session`；重启页面保持登录；退出后回到登录页。Expo Web 的 Metro 源在 CORS 白名单内。
- AC-13（`用户要求`）：Mobile 原生链在模拟器上通过：登录 → 开始巡检 → 选图上传 → 提交，显示 88；杀掉 Expo Go 重开后仍保持登录（Expo Go 的冷启动，原生 cookie 持久化）；退出后重开回到登录页；logcat 无 JS 错误。冷启动保持登录不成立时停下报告，不改用 SecureStore 存凭据绕过。
- AC-14（`建议采纳`）：Web 构建产物带 CSP：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: <API 源>; connect-src 'self' <API 源>; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`，API 源取自构建时的 `VITE_API_BASE_URL`。只加在 `vite build` 产物和 `vite preview`，`vite dev` 不加。新增一条 e2e：对构建产物登录、打开一张带照片的巡检单，断言没有 CSP 违规、照片显示。用 `<meta>` 时 `frame-ancestors` 不生效，在证据备注写明。
- AC-15（`用户要求`）：现有权限不变（主管才能审核、总部只读、店员只能动自己门店的单）；现有 API 测试、契约 e2e、Web e2e、`e2e:mobile`、`e2e:demo`、`e2e:demo-ui` 全绿；`scripts/demo-chain.mjs` 和 `scripts/api-snapshot.mjs` 改为带 cookie 调用后仍能跑通；全量门禁通过。为换登录方式改测试和脚本的登录步骤可以，断言不放宽，每处在证据备注写明。

## 验收方式

`B Agent 验收`

- cookie 属性从响应头断言；`document.cookie`、`localStorage` 用 Playwright 读页面断言；CSP 违规用 Playwright 监听控制台和 `securitypolicyviolation` 事件；原生链在模拟器取证。
- 本单元改契约目录、`apps/api/src/auth.ts`、`apps/api/src/db/schema.ts` 和迁移目录，都是 `scripts/workflow.conf` 的 hardline，相关提交带一行「硬线：」。
- 不加依赖。读 cookie 用请求头自己解析，不引入 `cookie-parser`；要加依赖就停下，按 AGENTS.md 第 7 节"需要扩大授权"处理。

## 涉及的当前事实

- [`specs/inspection.md`](../../specs/inspection.md)「契约与权限」「接口」「数据结构」「种子数据」：会话接口、会话 cookie 认证、Origin 检查、`sessions` 表、种子清空会话表；去掉 `/api/auth/login`。
- [`specs/web-console.md`](../../specs/web-console.md)「错误处理」「没有的」：会话改为 HttpOnly cookie、打开页面先校验会话；删掉 localStorage token 风险那句，改写为跨站点部署不支持。
- [`specs/mobile-inspector.md`](../../specs/mobile-inspector.md)「登录与今日巡检」：登录改用会话 cookie，重启保持登录靠系统 cookie 存储，SecureStore 不再存凭据。
- [`specs/workspace.md`](../../specs/workspace.md)「Web 页面壳」「没有的」：构建产物带 CSP；删掉 localStorage token 风险那句。

## 依赖

- FW-008

## 批准记录

- 批准依据：用户 2026-10-27 采纳全部三条建议（原话"三条建议我是要全加的，把会话表和 Mobile 改 cookie 也写进去。"），随后批准 spec（原话"批准，给我提示词我去codex实施"）
- 批准时间：`2026-10-27`
- 特殊授权：无。在主目录 master 上做，按任务本地提交，用户说推送再推送。
