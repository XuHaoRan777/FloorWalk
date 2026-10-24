# 单元收尾与归档

触发：工作单元到 `verified` 或 `descoped`（[`AGENTS.md`](../../AGENTS.md) 第 11 节）。按顺序做，一个提交完成。

1. 对账：`git log --reverse --format=%h -- docs/work/<本单元目录>` 的第一行是起点，列出起点以来的代码提交：

   ```bash
   git log --format="%h %s" <起点>~1..HEAD -- . ":(exclude)docs" ":(exclude)*.md"
   ```

   不带任何单元号、不带 `Mode: fix`、也没改本单元 `plan.md` 的提交，逐个列给用户问归谁：归本单元的在「回修」补一行，归修正模式的在 testlog 补一行，都不归的不记。交付之后（方式 A 写完「交接」、方式 B 审查通过）带本单元号的代码提交，每个在「回修」里有一行，对不上的补上。
2. 回修补审：上一步列表里带 `硬线：` 行的回修提交（`git log --grep "^硬线" <起点>~1..HEAD`），没有补审证据行的，按 [`final-review.md`](final-review.md) 补审这几个提交，修完再往下。
3. 交接：方式 A 用户已确认的，人工那行证据改 `passed`，用户原话写进备注。
4. Promote：按 `spec.md`「涉及的当前事实」改 `docs/specs/` 对应小节，每份加一行修订记录；回修改到的行为一并写进去；「数据契约」和代码路径按当前 schema 与目录树重新生成。`descoped` 不 Promote，未完成项留在 `plan.md`。
5. 升迁：`plan.md`「决策与偏差」里会影响后续的决策升入 `docs/adr/` 或 `specs/`；可复现的坑升入 `docs/pitfalls.md`；目录里若有长期有用的内容（设计规范、环境说明），搬到 `docs/context/` 或 `docs/howto/`。归档后的目录不被 `specs/`、`context/`、`adr/`、`pitfalls.md` 链接（校验器 `work-link`）。
6. 状态：`plan.md` 归档状态改 `archived`；从 Backlog「当前工作」和「待人工验收」删掉本单元的行，「已归档」加一行。
7. 清理：删除本单元 `evidence/`（不入库，删了只清本地）。
8. 门禁：运行文档校验，0 个问题后提交；提交后加 `--archive-gate` 再跑一次，必须 0 个问题（它要求 `git status --short` 为空）。工作树里有与本单元无关的未提交改动时，停下告诉用户，不替用户处理。

归档后的目录是历史：只读，新会话只在当前单元「依赖」列出或用户点名时读它。归档后的反馈进修正模式。
