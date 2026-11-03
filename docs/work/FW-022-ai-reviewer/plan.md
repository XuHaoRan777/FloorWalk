# AI 审核适配器 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`verified`
- 归档状态：`active`
- 并行组：g03，线 L3 第 1 个，线尾（上游 FW-017），槽位 3
- 当前任务：无，T01～T05 已完成
- 阻塞：无
- 下一步：已具备 g03/done/FW-022 打标条件；按并行协议让出 L3，等待 FW-023 合并与 Promote、归档

## 任务表

| ID  | 任务                        | 状态   | 交付的 AC 与证据                               |
| --- | --------------------------- | ------ | ---------------------------------------------- |
| T01 | 请求拼装与照片压缩          | `done` | AC-01、AC-02                                   |
| T02 | OpenAI 兼容适配器与结果校验 | `done` | AC-03                                          |
| T03 | 转人工的各种情况与配置检查  | `done` | AC-04、AC-05                                   |
| T04 | 冒烟测试                    | `done` | AC-06                                          |
| T05 | 最终代码审查                | `done` | 独立 Subagent，按 `docs/howto/final-review.md` |

## 证据

| 任务          | status | command                                                                                                                                                                                                 | artifact                                                      | 备注                                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01           | passed | `pnpm --filter @libs/shared build`；`pnpm --filter @apps/api typecheck`；`FW_SLOT=3 pnpm --filter @apps/api test src/ai/prompt.test.ts --update`                                                        | `apps/api/src/ai/prompt.ts`、`apps/api/src/ai/prompt.test.ts` | AC-01、AC-02：4 测试通过；已人工核对固定快照的角色、字段顺序、两个照片归属；现场生成 JPEG 2000×1500→1280×960、800×600 不放大。URL 读取字节后同样转 JPEG data URL；质量固定 80；不读写库、不落盘照片。启动文档校验通过，初始工作区干净，已切 g03/L3 并完成 frozen-lockfile 安装。                                                                                          |
| T02           | passed | `pnpm --filter @apps/api typecheck`；`FW_SLOT=3 pnpm --filter @apps/api test src/ai/openai.test.ts`                                                                                                     | `apps/api/src/ai/openai.ts`、`apps/api/src/ai/openai.test.ts` | AC-03：8 测试通过；注入客户端与 SDK fetch 截获均为一次请求，使用 OPENAI_MODEL、JSON schema strict；兼容 BASE_URL 为 base 或完整 endpoint，无重复路径。共享 schema 校验后核对编号集合与数量，覆盖缺项、多项、重复、替换及乱序对应。无真实外部调用、无写库。                                                                                                                |
| T03           | passed | `pnpm --filter @apps/api typecheck`；`FW_SLOT=3 pnpm --filter @apps/api test src/ai/openai.test.ts`                                                                                                     | `apps/api/src/ai/openai.test.ts`                              | AC-04、AC-05：18 测试通过（含 T02 的 8 项）；HTTP 错误、默认 60000ms/可注入超时、非法 JSON、schema 不符、编号不匹配、严重项失败却整单通过均转人工；超时 signal 被 abort 且计时器清理；原因固定中文、不透出密钥或请求体。真实 AppModule provider 构建在缺 API_KEY/MODEL 时拒绝启动，仅报键名；使用 override 隔离数据库与存储，无写库。默认 fake 与 openai 动态选择均通过。 |
| T04           | passed | `FW_SLOT=3 FW_AI_SMOKE=1 pnpm --filter @apps/api test src/ai/openai.smoke.test.ts`                                                                                                                      | `apps/api/src/ai/openai.smoke.test.ts`                        | AC-06：1 测试通过，真实模型仅调用一次，无重试。现场生成 640×480 白底红方块 JPEG 3653 字节，不落盘不入库；4397ms，原始响应整单 pass，项 00000000-0000-4000-8000-000000000022 为 pass，理由前 50 字「照片中央清晰可见一个红色方块，符合验收要点要求」；token 输入 785、输出 136、合计 921。共享 schema 通过，无 needs_human。默认运行跳过，结论准确率不在本单元验收范围。   |
| T05（机器门） | passed | `FW_SLOT=3 FW_AI_SMOKE=0 pnpm --filter @apps/api test`；`pnpm --filter @apps/api typecheck`；`pnpm --filter @apps/api build`；新增文件 `eslint`；`prettier --check apps/api/src/ai`；`git diff --check` | `apps/api/src/ai/`                                            | API 全量 11 文件 78 测试通过，冒烟默认跳过 1 项，无额外真实模型请求；类型、构建、lint 通过。格式首轮报 openai.test.ts，已仅格式化该文件后二次通过；未修改任何现有测试。既有数据库套件仅用槽位 3 并负责清理临时数据、恢复种子；迁移套件按已有实现只读开发库副本。完整 staged diff 已由主 Agent 检视，限 L3 新增文件、plan 与 Backlog 本行。                                |
| T05（审查） | passed | 独立 Subagent 按 `docs/howto/final-review.md` 读取 spec、plan、`git diff --cached` 完整差异和只读共享入口；`python scripts/validate_docs.py`；`node scripts/dev/proc.mjs status`；槽位端口检查；`git diff --check` | `apps/api/src/ai/`、`docs/work/FW-022-ai-reviewer/plan.md` | 独立 Subagent 审查通过，无 finding，主 Agent 已核对差异与机器门证据。七域：认证投影不适用（未改认证）；越权/代理核对照片归属和编号；并发/幂等无共享状态且一次调用、禁用重试、超时 abort；解码有 JSON/zod/编号及严重项矛盾校验；迁移不适用；敏感数据固定中文错误与脱敏摘要；范围仅批准的新文件和文档，无额外契约/配置。AC-01～06 无缺证据。proc 无输出，3130/3131/3132 无监听；未重跑机器门或真实模型。 |

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差
