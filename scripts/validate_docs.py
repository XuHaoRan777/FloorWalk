#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""文档校验器。

只做机械检查，不做流程语义判断：

1. 文档不含明文凭据或私钥。
2. 文档内部相对链接可达（只检查指向 `docs/` 或根目录 Markdown 的链接；
   指向代码文件的链接不检查，历史单元指向已删除代码属正常现象）。
3. 每个工作单元有 `spec.md` 和 `plan.md`，状态字段取值合法，
   `archived` 只能配 `verified` 或 `descoped`；同时 `active` 的单元不超过 3 个（`workflow.conf` 的 `active-units-max` 可改）。
4. Backlog 当前工作表与各单元 `plan.md` 的活动集合和状态一致。
5. `specs/`、`context/`、`adr/`、`pitfalls.md` 不链接到 `docs/work/`。
6. `docs/testlog.md` 的 `待同步` 行不超过 5 条，最早一行不超过 2 天。
7. `AGENTS.md` 字数不超过 `scripts/workflow.conf` 的 `kernel-max-chars`（按字符计）。
8. `--archive-gate`：工作树必须干净；`workflow.conf` 登记了 `gate` 行时，每个门在当前代码上都有
   `scripts/gate.py` 记下的通过记录（用户登记了 `gate-known-red` 的门只要求跑过）。
9. 未归档、在 `cross-unit-ac-since` 当天及以后批准（或未批准）的 `spec.md` 不引用别的单元的 AC。
10. 配置键契约（`workflow.conf` 配了 `env-*` 才查）：模板键有属性注释、被引用到；
    无默认值的引用键在模板里；`env-untracked on` 时 `.env*` 不被 Git 跟踪。
11. `--env-keys`：只报本地配置文件缺的键名，从不打印值。
12. 仓库根有 `scripts/hooks/commit-msg` 时，`core.hooksPath` 要指向 `scripts/hooks`。
13. `--kickoff <单元号…>`：先跑上面的检查，再查单元能不能开工（已批准、每条 AC 有标签和内容、
    验收方式已定、模板字样已填、任务表不超行数；多个单元号时加查接力线的排法和工作树干净），
    全过才打印开工提示词（`docs/howto/open-unit.md`）。
14. 回修表（表头有「状态」列的格式）：状态只能是 `做了|延后`；`延后` 行写用户同意的日期；
    未归档（或归档改动还没提交）的单元，没转进别的单元的延后条数不多于 Backlog「待开单元」里注明本单元号的行数。
15. 已 `verified|descoped`、工作树干净却仍 `active` 的单元（接力线中间、并行组线上的除外）。
16. 已归档单元 spec「批准记录」里 `- 归档产物：` 列的文件都存在；ADR 文件头状态和 `docs/adr/README.md` 索引表一致。
17. 活动单元「依赖」列的消费路径：上游已交付（verified 或已归档）时必须存在。
18. `--sync-backlog`：按各 `plan.md` 重写 Backlog「当前工作」表再校验；`--downstream <单元号>`：列出依赖它的活动单元
    和它们要消费的路径，归档时复核用（`docs/howto/archive.md`）。

`CLAUDE.md` 只含 `@AGENTS.md` 导入，不再需要内核同步检查。`workflow.conf` 的
`hardline` 路径由 `scripts/hooks/commit-msg` 检查，不在这里。

用法：
    python scripts/validate_docs.py [--root DIR] [--archive-gate] [--today YYYY-MM-DD] [--env-keys]
    python scripts/validate_docs.py --kickoff <单元号> [<单元号>...]
    python scripts/validate_docs.py --sync-backlog
    python scripts/validate_docs.py --downstream <单元号>

退出码 0 表示通过，1 表示存在错误。
"""
from __future__ import annotations

import argparse
import ast
import datetime as _dt
import importlib.util
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

# 检查分在同目录的 vd_*.py 里；测试用文件路径加载本文件时也要找得到它们。
sys.path.insert(0, str(Path(__file__).resolve().parent))
from vd_common import *  # noqa: E402,F403
from vd_content import *  # noqa: E402,F403
from vd_env import *  # noqa: E402,F403
from vd_units import *  # noqa: E402,F403
from vd_repo import *  # noqa: E402,F403
from vd_kickoff import *  # noqa: E402,F403
from vd_closeout import *  # noqa: E402,F403


def report_kickoff(root: Path, unit_ids: list[str], *, today: _dt.date | None = None) -> int:
    """`--kickoff`：文档校验和开工检查都过了才打印提示词，否则列出问题。"""
    issues = validate_repository(root, today=today)
    modes = check_kickoff(root, unit_ids, issues)
    for issue in issues:
        print(issue)
    if issues:
        print(f"还不能开工：{len(issues)} 个问题，不生成提示词")
        return 1
    print("开工提示词（在项目主目录开新会话，整段发送）：")
    print()
    print(kickoff_prompt(unit_ids, modes))
    return 0


def validate_repository(
    root: Path, *, archive_gate: bool = False, today: _dt.date | None = None
) -> list[Issue]:
    issues: list[Issue] = []
    today = today or _dt.date.today()

    markdown_paths = [root / name for name in ("AGENTS.md", "CLAUDE.md") if (root / name).is_file()]
    docs_root = root / "docs"
    if docs_root.is_dir():
        markdown_paths.extend(sorted(docs_root.rglob("*.md")))
    for path in markdown_paths:
        content = read_text(path)
        check_sensitive(path, content, root, issues)
        check_links(path, content, root, issues)
        check_no_work_links(path, content, root, issues)

    states = check_work_units(root, issues)
    check_backlog(root, states, issues)
    check_rework(root, states, issues)
    check_unarchived(root, states, issues)
    check_archive_products(root, states, issues)
    check_dependency_paths(root, states, issues)
    check_adr_index(root, issues)
    check_testlog(root, issues, today=today)
    check_kernel_size(root, issues)
    check_cross_unit_ac(root, issues)
    check_env_contract(root, issues)
    check_env_tracked(root, issues)
    check_hooks_installed(root, issues)

    if archive_gate:
        check_worktree_clean(root, issues)
        check_gate_records(root, issues)
    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description="文档校验器")
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parents[1], help="仓库根目录"
    )
    parser.add_argument("--archive-gate", action="store_true", help="归档门：要求 git 工作树干净")
    parser.add_argument("--today", type=_dt.date.fromisoformat, default=None, help="覆盖当天日期（测试用）")
    parser.add_argument("--env-keys", action="store_true", help="只检查本地配置文件缺不缺键，只打印键名")
    parser.add_argument(
        "--kickoff", nargs="+", metavar="单元号", help="单元就绪时打印开工提示词；多个单元号按顺序当一条接力线"
    )
    parser.add_argument("--sync-backlog", action="store_true", help="按各 plan 重写 Backlog「当前工作」表，再校验")
    parser.add_argument("--downstream", metavar="单元号", help="列出依赖这个单元的活动单元和它们要消费的路径")
    args = parser.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    root = args.root.resolve()
    if args.env_keys:
        return report_env_keys(root)
    if args.kickoff:
        return report_kickoff(root, args.kickoff, today=args.today)
    if args.downstream:
        return report_downstream(root, check_work_units(root, []), args.downstream)
    if args.sync_backlog:
        problem = sync_backlog(root, check_work_units(root, []))
        if problem:
            print(problem)
            return 1
        print("已按各 plan 重写 Backlog「当前工作」表")

    issues = validate_repository(root, archive_gate=args.archive_gate, today=args.today)
    for issue in issues:
        print(issue)
    if issues:
        print(f"文档校验失败：{len(issues)} 个问题")
        return 1
    print("文档校验通过：0 个问题")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
