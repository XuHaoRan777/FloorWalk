# 阿里云 OSS 存储驱动 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`blocked`
- 归档状态：`active`
- 并行组：g03，线 L2 第 1 个，线尾（上游 FW-017），槽位 2
- 当前任务：T03
- 阻塞：真实 OSS 上传与清理均返回网络错误（SDK status=-1），AC-04 未通过，远端清理无法确认
- 下一步：用户决定真实 OSS 网络/配置的排查方向后，删阻塞 tag 并继续 T03；通过后再做 T04

## 任务表

| ID  | 任务                          | 状态      | 交付的 AC 与证据                               |
| --- | ----------------------------- | --------- | ---------------------------------------------- |
| T01 | `OssStorageDriver` 与单元测试 | `done` | AC-01、AC-02                                   |
| T02 | 配置检查                      | `done` | AC-03                                          |
| T03 | 冒烟测试                      | `blocked` | AC-04                                          |
| T04 | 最终代码审查                  | `pending` | 独立 Subagent，按 `docs/howto/final-review.md` |

## 证据

| 任务 | status | command | artifact | 备注 |
| ---- | ------ | ------- | -------- | ---- |
| T01 | passed | `FW_SLOT=2 pnpm --filter @apps/api test src/storage/oss.test.ts`；`pnpm --filter @apps/api typecheck` | `apps/api/src/storage/oss.ts`、`apps/api/src/storage/oss.test.ts` | AC-01、AC-02：4 个测试通过；假客户端验证全部对象键前缀、上传私有 ACL、MIME/流透传、GET 签名有效期、NoSuchKey 映射为现有 NOT_FOUND 404、网络异常原样抛出；未写数据库或 OSS。 |
| T02 | passed | `FW_SLOT=2 pnpm --filter @apps/api test src/storage/oss.test.ts`；`pnpm --filter @apps/api typecheck` | `apps/api/src/storage/oss.test.ts` | AC-03：9 个测试通过；5 个必填键分别缺失时，getStorageDriver 拒绝，真实 API 子进程启动退出码 1，日志含缺失键名且不含测试配置值；仅使用槽位 2 地址，没有连接或写入数据库。 |
| T03 | failed | 在 `apps/api/` 以 `FW_SLOT=2 FW_OSS_SMOKE=1 node --env-file=F:/project/FloorWalk/apps/api/.env.development --import=tsx --import=../../tests/e2e/api-test-env.ts node_modules/vitest/vitest.mjs run --no-file-parallelism src/storage/oss.smoke.test.ts` 运行 | `apps/api/src/storage/oss.smoke.test.ts` | AC-04：第二次真实执行 276ms 在 put 阶段失败，脱敏结果 code=unclassified、status=-1；finally 删除也失败。SDK client.js 将 -1 定义为网络错误，尚未得到 OSS HTTP 响应，不能据此归因为权限或凭据。此次对象键 `smoke/01ffcc37-227b-4bf9-aaa0-14daa1dfc0f8.jpg`（相对于 OSS_PREFIX），未确认创建成功，亦未确认清理成功；首轮也未确认清理。默认不开开关时冒烟跳过；9 个单元测试及 API 类型检查通过。 |

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

- T02 首轮启动测试失败：子进程 cwd 多退一级，指向 `apps/src/main.ts`，未进入 API 启动链；修正为 `apps/api/` 后复测同一测试文件，驱动配置检查本身已通过。
- 阻塞保存前检查：槽位 2 定向测试 9 passed、冒烟默认 1 skipped；API typecheck、新增三文件 ESLint、Prettier 和 `git diff --check` 通过；文档校验 0 个问题。未到单元结束，未执行最终全量套件、构建或独立审查，不宣称完成。
- T03 首轮真实冒烟 303ms 失败，finally 清理也失败并遮住原异常；假设为请求配置或外部权限问题。下一次实验保留首个失败阶段及白名单错误码、HTTP 状态，不输出 SDK 原始异常或签名 URL；默认关闭冒烟时已确认跳过。
- 卡在哪：真实 OSS 连续两次在上传/清理请求失败，第二次诊断保留首个失败阶段，确认 SDK status=-1 为网络层失败；AC-04 不能验收，停止重复调用外部服务。
- 要用户定什么：确认下一步是否由用户修复本机到 OSS 的网络或环境配置后重试；当前不扩大到改依赖、共享模块或主目录 env。
- 可选项和倾向：先修通真实 OSS 访问再在本线续验（倾向）；或由用户明确调整 AC-04 的验收边界。仅缺键才允许的人工验收豁免不适用于本次网络失败，不能标 verified。
