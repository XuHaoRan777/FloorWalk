# 阿里云 OSS 存储驱动 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`active`
- 并行组：g03，线 L2 第 1 个，线尾（上游 FW-017），槽位 2
- 当前任务：无
- 阻塞：无
- 下一步：本线已让出；待 `g03/done/FW-020` 出现后由最后完成的线尾创建 `g03/close` 并启动集成

## 任务表

| ID  | 任务                          | 状态      | 交付的 AC 与证据                               |
| --- | ----------------------------- | --------- | ---------------------------------------------- |
| T01 | `OssStorageDriver` 与单元测试 | `done` | AC-01、AC-02                                   |
| T02 | 配置检查                      | `done` | AC-03                                          |
| T03 | 冒烟测试                      | `done` | AC-04                                          |
| T04 | 最终代码审查                  | `done` | 独立 Subagent，按 `docs/howto/final-review.md` |

## 证据

| 任务 | status | command | artifact | 备注 |
| ---- | ------ | ------- | -------- | ---- |
| T01 | passed | `FW_SLOT=2 pnpm --filter @apps/api test src/storage/oss.test.ts`；`pnpm --filter @apps/api typecheck` | `apps/api/src/storage/oss.ts`、`apps/api/src/storage/oss.test.ts` | AC-01、AC-02：4 个测试通过；假客户端验证全部对象键前缀、上传私有 ACL、MIME/流透传、GET 签名有效期、NoSuchKey 映射为现有 NOT_FOUND 404、网络异常原样抛出；未写数据库或 OSS。 |
| T02 | passed | `FW_SLOT=2 pnpm --filter @apps/api test src/storage/oss.test.ts`；`pnpm --filter @apps/api typecheck` | `apps/api/src/storage/oss.test.ts` | AC-03：9 个测试通过；5 个必填键分别缺失时，getStorageDriver 拒绝，真实 API 子进程启动退出码 1，日志含缺失键名且不含测试配置值；仅使用槽位 2 地址，没有连接或写入数据库。 |
| T03 | passed | 在 `apps/api/` 运行 `FW_SLOT=2 node --env-file=F:/project/FloorWalk/apps/api/.env.development --import=tsx --input-type=module -e "import { OssStorageDriver } from './src/storage/oss.ts'; await new OssStorageDriver().delete('smoke/01ffcc37-227b-4bf9-aaa0-14daa1dfc0f8.jpg'); console.log('known previous smoke object cleanup succeeded');"`；再运行 `FW_SLOT=2 FW_OSS_SMOKE=1 node --env-file=F:/project/FloorWalk/apps/api/.env.development --import=tsx --import=../../tests/e2e/api-test-env.ts node_modules/vitest/vitest.mjs run --no-file-parallelism src/storage/oss.smoke.test.ts` | `apps/api/src/storage/oss.smoke.test.ts` | AC-04：先行删除上次可识别的对象成功；真实冒烟 1/1 通过，signed GET 返回同字节 JPEG，unsigned GET 403，删除后 GET 映射 NOT_FOUND，finally 清理成功。用户确认之前 OSS_ENDPOINT 误含 Bucket 名并已修正。本轮随机对象由测试自行清理。首轮失败运行未记录随机键，是否遗留该对象无法核实。 |
| T04 | passed | 独立 Subagent 按 `docs/howto/final-review.md` 审查 `git diff g03/start...HEAD` 与未提交差异；`FW_SLOT=2 pnpm --filter @apps/api test`；`pnpm --filter @apps/api typecheck`；`pnpm --filter @apps/api build`；`pnpm --filter @apps/api lint` | `docs/howto/final-review.md` | 无 finding；核对 AC-01～AC-04 与七个失败域。API 全量套件 65 passed、1 skipped；typecheck、build、lint 通过。 |

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

- T02 首轮启动测试失败：子进程 cwd 多退一级，指向 `apps/src/main.ts`，未进入 API 启动链；修正为 `apps/api/` 后复测同一测试文件，驱动配置检查本身已通过。
- 阻塞保存前检查：槽位 2 定向测试 9 passed、冒烟默认 1 skipped；API typecheck、新增三文件 ESLint、Prettier 和 `git diff --check` 通过；文档校验 0 个问题。未到单元结束，未执行最终全量套件、构建或独立审查，不宣称完成。
- T03 两次旧冒烟在 put 和 finally 清理阶段返回网络错误。用户于 2026-11-03 说明 OSS_ENDPOINT 原先误填为带 Bucket 名的访问域名，已修正并授权重跑；恢复后先行删除已知失败键成功，冒烟全路径通过。第一轮的随机对象键未被日志保存，遗留状态无法核实。
- 单元结束检查：`FW_SLOT=2 pnpm --filter @apps/api test` 65 passed、1 skipped（默认关闭真实 OSS）；单独启用的真实 OSS 冒烟 1 passed。API typecheck、build、lint 通过。独立 Subagent 最终审查无 finding；文档校验和最终工作区检查通过。
