# 0003. API 来源白名单

- 状态：`accepted`
- 日期：`2026-11-03`
- 来源工作单元：`FW-020`
- 取代：[`ADR 0002`](0002-unrestricted-api-cors.md)

## 背景

API 使用 HttpOnly 会话 Cookie。任意来源可携带凭据读取响应并提交写请求；SameSite Cookie 不能替代服务端来源校验。

## 决策

- `CORS_ORIGINS` 是逗号分隔的精确 Origin 白名单；仅白名单 Origin 获得 CORS 响应头并可带凭据访问。
- 带 Origin 的 `POST`、`PUT`、`PATCH`、`DELETE` 请求以及对应预检，只允许白名单来源；不带 Origin 的原生 App 和服务端调用不受来源校验影响。
- 不在白名单的 GET 不回 CORS 响应头；不在白名单的写请求返回 403 `FORBIDDEN`。
- 无 `FW_SLOT` 的本机 development 模式，额外允许本机局域网 IPv4 的 Web（3019）与 Expo（3020）Origin，供同一 Wi-Fi 下的演示客户端访问。
- Cookie 的 `SameSite=Strict` 属性保持不变。

## 后果

浏览器只允许已配置来源读取带凭据的 API 响应。新增部署来源必须加入白名单；原生客户端不发送 Origin 时仍可调用。

## 被否决的方案及原因

- 任意回显 Origin：允许不可信页面读取登录用户数据并提交写请求。
- `Access-Control-Allow-Origin: *` 配合 credentials：浏览器不允许这种凭据组合。
