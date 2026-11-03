# 并行组 g03 集成

> ID：`FW-023`
>
> 状态：`approved`

## 目标

并行组 g03 的集成单元（[`howto/parallel.md`](../../howto/parallel.md) 第 6 节），在主目录 master 上做。合并三条线，全量测试，重置开发库，让用户能直接启动、用两个商家登录，然后清理并归档本组全部单元。

## 非目标

- 不替线上单元补证据：缺证据的回那条线的分支补齐再合并（parallel.md 第 7 节）。
- 不做新功能、不改样式。
- 不切换开发环境到 OSS 或真实模型：开发 env 的 `STORAGE_DRIVER`、`AI_DRIVER` 是否改由用户决定，本单元只在交接里写怎么改。

## 验收标准

- AC-01（`用户要求`）：按 `g03/L1`、`g03/L2`、`g03/L3` 顺序 `git merge --no-ff`，提交信息带本单元号；合并前按 parallel.md 第 6 节 T01 查硬线路径，有不是 FW-017 批准、也不是 FW-020 授权（`auth.ts`、`main.ts`）的改动就停下报告；冲突文件数记进试行记录。
- AC-02（`用户要求`）：合并后类型检查、lint、`format:check`、构建、`FW_SLOT=1 pnpm --filter @apps/api test`、`pnpm e2e:slots`、`e2e:cors`、`e2e:demo`、Web 与 Mobile 界面 e2e、`e2e:demo-ui` 全绿。
- AC-03（`用户要求`）：跨线组合：在 `STORAGE_DRIVER=local`、`AI_DRIVER=fake` 下，演示二号的 admin 注册一个新商家 → 建主管和店员 → 店员首次登录改密码 → 提交巡检（照片走存储接口，键在新商家路径下）→ 用 `FakeAiReviewer` 对这张单跑一次，返回通过 schema → Northbean 的账号看不到这家商家的任何数据。写成 API 层的 e2e（`tests/e2e/`），不进默认套件也可以，命令写进证据。
- AC-04（`用户要求`）：冒烟测试在主目录各跑一次：`FW_OSS_SMOKE=1` 的 OSS 冒烟、`FW_AI_SMOKE=1` 的模型冒烟；env 缺键的那条登记「待人工验收」并写明缺哪些键名。 两项都通过时再跑一次组合：用 `STORAGE_DRIVER=oss` 把生成的红方块图 put 到 OSS 的 `smoke/` 下，拿 OSS 签名链接（不转 base64）调一次模型，记录模型能否拉取；测完删除对象。（2026-11-03 用户原话"按建议"）
- AC-05（`用户要求`，用户能直接启动）：开发库重置并迁移到最新、灌种子；在主目录 `pnpm dev` 起三端：API `/health` 200；Web 3019 用 Northbean admin、主管甲、演示二号 admin 各登录一次，看到的门店数分别是 12、6、1；Expo Go 用一个店员账号能连上。然后停掉；在 plan「交接」写三行启动说明和两个商家的演示账号。
- AC-06（`用户要求`）：交付与归档：六个单元都是方式 B，按 FW-017、FW-018、FW-019、FW-020、FW-021、FW-022 顺序 Promote 并归档，最后归档本单元；对账范围按 parallel.md 第 6 节 T05。
- AC-07（`用户要求`）：清理：`node scripts/dev/proc.mjs status` 无输出；3018～3020、3110～3132 无监听；冒烟测试写的 OSS 对象已删；写进证据。试行记录写本组的数（单元、开组到收组、契约改动、合并冲突、演示链首跑失败处、人工触点"待 Claude 复核"）。

## 验收方式

`B Agent 验收`

- 人工触点由 Claude 在集成复核时按试行记录的口径核定，本单元先按自己记的填。

## 涉及的当前事实

- 由本单元按 FW-017～FW-022 各自「涉及的当前事实」统一 Promote：`specs/inspection.md`、`specs/web-console.md`、`specs/admin.md`、`specs/mobile-inspector.md`、`specs/workspace.md`；`context/dev-environment.md` 的环境变量与 `proc.mjs`。

## 依赖

- FW-020
- FW-021
- FW-022

## 批准记录

- 批准依据：用户 2026-11-03 原话"一起批准"（g03 七个单元一起批准）；组的构成与 9 条产品语义见 FW-017 plan「决策与偏差」
- 批准时间：`2026-11-03`
- 特殊授权：并行组 g03 集成单元，主目录 master。写入范围默认含合并冲突涉及的文件、`tests/`、`playwright.*.config.ts`、`scripts/demo-chain.mjs`、`scripts/dev/proc.mjs` 和 docs；重置并写开发库 `floorwalk`；冒烟测试调用真实 OSS 与模型各一次；在 master 本地提交，不推送；删本组 tag 和分支由用户在收组后决定。
