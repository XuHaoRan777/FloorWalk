# 修正模式收尾（"收一下"）

触发：用户说"收一下"（[`AGENTS.md`](../../AGENTS.md) 第 3 节）。校验器报 `testlog-debt` 时 Agent 只问"收一下？"，不自行开始。按顺序做，一个提交完成。

1. 对账：起点是上一个标题含"收一下"的提交（`git log -1 --format="%h %s" --grep 收一下`）；还没有这样的提交时，把上次收尾的提交号报给用户确认后再用。列出起点以来的代码提交：

   ```bash
   git log --format="%h %s" <起点>..HEAD -- . ":(exclude)docs" ":(exclude)*.md"
   ```

   不带任何单元号、不带 `Mode: fix`、也没改任何单元 `plan.md` 的提交，逐个列给用户问归谁，补进 testlog 或对应活动单元的「回修」，都不归的不记。带 `硬线：` 行的修正提交（`git log --grep "^硬线" <起点>..HEAD`），对应 testlog 行的「审查」必须是 `待审查`，不是的改过来。
2. 合审：`待审查` 行连同对应提交，合起来交给没写过这些代码的上下文，按 [`final-review.md`](final-review.md) 审一轮；有 finding 先修，修完只复核那几条。
3. Promote：所有 `待同步 <文件>「<小节>」` 行合并进对应 `docs/specs/` 小节，每份加一行修订记录。
4. 升迁：用户当场做的产品决定里值得留的升 `docs/adr/`；可复现的坑升 `docs/pitfalls.md`。
5. 清空：删掉 testlog 全部数据行，保留表头。
6. 门禁：运行文档校验，0 个问题后提交。提交标题含"收一下"（下次对账的起点），合审结论写进提交信息。

testlog 只存上次收尾以来的行；历史在 `git log --grep "Mode: fix"` 和各 spec 的修订记录，不在 testlog。
