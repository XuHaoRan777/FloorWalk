# 巡检业务规则 API

> ID：`FW-004`
>
> 状态：`approved`

## 目标

并行组 g01 的并行单元（槽位 1，[`howto/parallel.md`](../../howto/parallel.md) 第 3 节）。
API 按契约实现巡检业务规则：提交锁分、审核状态迁移、检查项修改、照片落盘与签名链接、看板取分。
做完后演示链 e2e（`pnpm e2e:demo`）从红变绿。

## 非目标

- 不改契约（`packages/shared/src/contract/`）、表结构、迁移、`apps/api/src/auth.ts`、种子。契约不够用时停下报告（parallel.md 第 5 节）。
- 不做页面，不改 `apps/web`、`apps/mobile`。
- 不加依赖，不改任何 `package.json`。

## 验收标准

规则以 [`specs/inspection.md`](../../specs/inspection.md) 和契约代码为准，下面每条都用 API 测试取证。

- AC-01（`用户要求`）：提交时，有 `pending` 项或必拍项没有照片，返回 422 `INCOMPLETE`；单不在 `draft`、`rework` 状态时返回 409 `INVALID_STATE`。成功提交后，状态变为 `submitted`，记下 `submitted_at`，按契约公式计算分数并锁定；从 `rework` 重新提交时重新计算。
- AC-02（`用户要求`）：审核按契约的状态迁移表执行：`start` 只在 `submitted` 状态下可用，结果是 `in_review`；`approve`、`rework`、`fail` 只在 `in_review` 状态下可用。其余组合返回 409 `INVALID_STATE`。每次审核写一条审核记录，`approve`、`fail` 同时记下 `decided_at`。
- AC-03（`用户要求`）：有严重项不合格时，`approve` 返回 422 `CRITICAL_FAILED`。`rework` 的 `reworkItemIds` 必须全部属于这张单，否则返回 400 `VALIDATION_FAILED`。
- AC-04（`用户要求`）：检查项只能在 `draft`、`rework` 状态下修改，其他状态返回 409 `INVALID_STATE`。打回后店员能改所有项，不限被打回的项。照片上传遵守同样的状态限制。
- AC-05（`用户要求`）：照片上传写入 `STORAGE_DIR`，类型和大小限制按契约执行，超限返回 400 `VALIDATION_FAILED`。`GET /api/evidence/:id` 返回带签名、1 小时后过期的链接；照片文件路由校验签名，签名错误或已过期返回 403 `FORBIDDEN`，正确的签名返回图片。
- AC-06（`用户要求`）：看板上每家店显示 `decided_at` 最新的那张 `passed` 或 `failed` 单。判定一张新单后，看板随之变化。
- AC-07（`用户要求`）：`FW_SLOT=1 pnpm e2e:demo` 全绿：提交得 88，打回后补拍、重新提交得 100，通过后看板上 `NB-001` 显示 100。

## 验收方式

`B Agent 验收`

所有命令都带 `FW_SLOT=1`，不跑 `pnpm e2e:slots`（parallel.md 第 3 节）。

## 涉及的当前事实

- [`specs/inspection.md`](../../specs/inspection.md)「巡检规则」「接口」：骨架阶段的说明（固定分数、签名未实现）改写为实际行为。由集成单元 FW-007 统一 Promote，本单元不改 specs。

## 依赖

- FW-003

## 批准记录

- 批准依据：用户 2026-10-24 批准并行组 g01 的范围与 5 项默认，原话"需要我确认的5项全安你建议的来。建议补充的也加上。"
- 批准时间：`2026-10-24`
- 特殊授权：并行组 g01，写入范围：`apps/api/src`（不含 `auth.ts`、`db/`），API 测试文件放在 `apps/api/src` 下；在本分支 `g01/FW-004` 本地提交，不推送；只用 `floorwalk` 角色连 `floorwalk_e2e_1`。
