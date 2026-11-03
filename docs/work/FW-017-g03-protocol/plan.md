# g03 协议：多商家、账号、存储与 AI 接口 - 执行计划

> 规格：[`./spec.md`](./spec.md)

## 当前状态

- 工作单元状态：`in_progress`
- 归档状态：`active`
- 并行组：g03，协议单元（线 L1：FW-018 → FW-019 → FW-020；L2：FW-021；L3：FW-022；集成 FW-023）
- 当前任务：T03 已完成，按用户要求暂停；未进入 T04
- 阻塞：等待 Claude 核对 T01～T03 的迁移与存储改动后再继续（用户指定检查点）
- 下一步：向用户交接迁移和存储 diff；收到 Claude 核对结果及继续指令后进入 T04

## 任务表

| ID  | 任务                                                                                                         | 状态      | 交付的 AC 与证据                                      |
| --- | ------------------------------------------------------------------------------------------------------------ | --------- | ----------------------------------------------------- |
| T01 | 迁移、schema、共享契约（角色、商家、账号、路由表、AI schema）；装 `ali-oss`、`openai`、`sharp`（跑一次缩放） | `done` | 无，机器门                                            |
| T02 | 迁移实测：空库、开发库副本、槽位库；种子按两个商家重建，存储键改新格式                                       | `done` | AC-01、AC-02                                          |
| T03 | `hq` 改 `admin`、存储改走 `LocalStorageDriver`，现有全部测试回绿                                             | `done` | AC-04                                                 |
| T04 | 门店范围函数与测试；契约 e2e 遍历新路由                                                                      | `pending` | AC-03、AC-05                                          |
| T05 | 注册行与两端空桩；`FakeAiReviewer` 与 `needs_human` 测试；`proc.mjs` 加 `api`                                | `pending` | AC-06、AC-07、AC-09                                   |
| T06 | AI 探针；环境清单键名核对                                                                                    | `pending` | AC-08                                                 |
| T07 | 开组检查与最终代码审查                                                                                       | `pending` | AC-10；独立 Subagent，按 `docs/howto/final-review.md` |

## 证据

| 任务 | status | command | artifact | 备注 |
| ---- | ------ | ------- | -------- | ---- |
| T01 | passed | `node scripts/dev/proc.mjs status`; `Get-NetTCPConnection -State Listen`; `pnpm --filter @apps/api add --save-exact ali-oss@6.23.0 openai@7.47.0 sharp@0.35.5`; `pnpm --filter @apps/api exec node --input-type=module -e '<内存中执行 sharp 缩放>'`; `pnpm --filter @libs/shared typecheck`; `pnpm --filter @libs/shared build`; `pnpm --filter @apps/api exec drizzle-kit check` | `apps/api/drizzle/0003_g03_protocol.sql`、`packages/shared/src/contract/`、`apps/api/src/storage/types.ts` | 启动时进程脚本无输出，3018～3020、3110～3132 无监听，干净 master，文档校验通过；依赖安装成功，sharp 在 Windows 输出 2×2 PNG。schema、前向迁移与快照、共享契约、存储接口完成；共享契约 typecheck/build 与 drizzle-kit check 通过；共享契约子 Agent 仅写 contract 目录，主 Agent 已核对 diff。现有消费者在 T03 适配；迁移实测在 T02。 |
| T02 | passed | `FW_SLOT=1 pnpm --filter @apps/api test src/db/migrate.test.ts`; `FW_SLOT=1 pnpm --filter @apps/api test src/db/seed.test.ts` | `apps/api/src/db/migrate.test.ts`、`apps/api/src/db/seed.test.ts` | AC-01：空库前后各表 0；开发副本前后 sites/users/templates/template_items/inspections/inspection_items/evidence/reviews/sessions/chat_messages = 12/14/1/8/19/152/36/18/5/2；槽位旧格式副本前后 = 12/15/1/8/18/144/36/16/0/2。均归 Northbean、hq→admin、照片逐字节相同、旧键清理、重跑不丢数据。开发库以只读连接访问；首次因测试假设默认存储路径失败，改用既有 Node env-file 入口加载实际配置（不读文件、不打印值）后通过。AC-02：6 个种子测试通过，Northbean 12店/2主管各6店/1admin/12店员/18单，第二商家1店/3账号/1已判定单。测试最终重建槽位种子，未修改开发库。T02 为种子接入先提供 LocalStorageDriver，三个控制器在 T03 切换。 |
| T03 | passed | `pnpm typecheck`; `FW_SLOT=1 pnpm --filter @apps/api test`; `FW_SLOT=1 pnpm --filter @apps/api test src/chat.test.ts`; `FW_SLOT=1 pnpm exec playwright test --config=playwright.web.config.ts`; `FW_SLOT=1 pnpm e2e:mobile`; `FW_SLOT=1 pnpm e2e:cors`; `FW_SLOT=1 pnpm e2e:demo`; `FW_SLOT=1 pnpm e2e:demo-ui`; 失败文件按对应配置重跑；受影响 TS/TSX 的 eslint、prettier；`python scripts/validate_docs.py`; `git diff --check`; `node scripts/dev/proc.mjs status`; 端口检查 | `apps/api/src/storage/`、`apps/api/src/session.test.ts`、`apps/api/src/contract.e2e.test.ts` | AC-04：全工作区类型检查通过；API 7 文件 47 测试通过（含迁移、种子、现有契约、照片/聊天/清理、会话）。Cookie 与活动时间一起按批准规格改为闲置 7 天。新增 7 路由在 T04 接入角色遍历，当前保留既有 24 路由检查；Web 首轮 11 passed/1 skipped/2 failed：同名模板使旧定位匹配两行，聊天请求计数仍匹配旧键；分别用完整按钮名称与解码后 chat 路径精确定位，断言不放宽，重跑两文件 5 测试通过。受影响文件 lint 首轮发现未使用 MIME 参数与错误缺 cause，已修。Mobile 首轮 13 passed/3 failed，均因记录测试直接插入用户漏 org_id；改为从所属门店推导 org_id，重跑该文件 5 测试通过；原断言保留。聊天改为事务内写入并签名、成功后提交，避免签名失败删掉已入库图片；对应 chat.test.ts 3 测试通过，新增失败清理断言。Mobile 已回绿；CORS 首轮启动因 LocalStorageDriver 引用含装饰器的 auth.ts 导致根 tsx 配置报错，抽出无装饰器的 auth-config.ts（不改配置语义），API 类型检查与对应 lint 通过，CORS 3 测试通过；demo 链通过，demo-ui 1 测试通过；Web 合计 13 passed/既有 1 skipped，Mobile 合计 16 passed。受影响 TS/TSX lint 通过；契约测试文件仅格式修正后 prettier 通过。demo-ui 前后进程脚本与 3018～3020、3110～3132 监听检查均为空。T03 完成后按用户要求暂停，等待 Claude 核对，不进入 T04。写库测试沿用槽位 1，套件负责清理临时记录，保留种子。 |

## 回修

| 日期 | 反馈 | 改动 | 提交 |
| ---- | ---- | ---- | ---- |

## 决策与偏差

- 2026-11-03：用户定 g03 为基础设施组（多商家与账号一条线、OSS、AI 底座），9 条产品语义全按默认：注册页公开、邮箱全局唯一、主管可停用和重置本店店员、只停用不删除、会话闲置 7 天、初始密码由创建者填至少 8 位、主管看不到其他主管、无主管的门店只有商家管理员能审、种子 12 店分给 2 个主管。
- 2026-11-03：T01 阻塞：接口表中 `GET /admin/sites` 是现有路由，其余只有 7 条新增路由，AC-03 却写新增 8 条。依 AGENTS.md 第 7 节，已批准 spec 自相矛盾时停止，不自行补接口或改验收数量；待用户确定按 7 条修正计数，还是提供第 8 条接口。未执行迁移、未提交、未推送。

- 2026-11-03：用户确认新增接口数量修正为 7 条，解除 T01 阻塞，继续执行。
