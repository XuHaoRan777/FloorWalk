# -*- coding: utf-8 -*-
"""开工检查（--kickoff）（`validate_docs.py` 的一部分，入口和检查清单在那里）。"""
from __future__ import annotations

import ast
import datetime as _dt
import importlib.util
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

from vd_common import *  # noqa: F403


AC_LINE_PATTERN = re.compile(r"^- AC-\d+.*$", re.MULTILINE)


# 只查有没有标签和内容，不枚举标签：项目可以有内核之外的标签（如立项出包的 `AI 定`）。
AC_FILLED_PATTERN = re.compile(r"^- AC-\d+（`[^`]+`）[：:]\s*\S")


ACCEPTANCE_MODES = {"A": "A 人工验收", "B": "B Agent 验收"}


# 批准时任务表的行数上限（AGENTS.md 第 6 节）。
MAX_APPROVED_TASKS = 8


KICKOFF_WORK_STATUSES = {"approved", "in_progress"}


SPEC_APPROVAL_BASIS_PATTERN = re.compile(r"^- 批准依据：[ \t]*\S", re.MULTILINE)


# spec 模板里没填就会留下的字样；测试核对它们确实出现在 docs/work/_template/spec.md 里。
SPEC_TEMPLATE_LEFTOVERS = (
    "<工作单元名称>",
    "<前缀>",
    "<模块>",
    "<小节>",
    "<用户原话或指令摘要>",
    "<无，或相对常设授权",
    "<不在接力线上删掉本行",
    "<无，或归档时要写出的文件",
)


RELAY_PROBE_PATTERN = re.compile(r"^- 接力探针.*\d{4}-\d{2}-\d{2}", re.MULTILINE)


PARALLEL_GROUP_PATTERN = re.compile(r"^- 并行组：", re.MULTILINE)


def check_kickoff_unit(root: Path, unit_id: str, issues: list[Issue], *, in_relay: bool) -> str:
    """单元能不能开工；返回验收方式 `A` 或 `B`，定不出来返回空串。"""
    unit = find_unit_dir(root, unit_id)
    if unit is None:
        issues.append(Issue("kickoff", "docs/work", f"找不到单元 {unit_id}，或同号目录不止一个"))
        return ""
    spec_path, plan_path = unit / "spec.md", unit / "plan.md"
    if not spec_path.is_file() or not plan_path.is_file():
        return ""  # 常规检查已报 unit-file
    spec_where, plan_where = relative(spec_path, root), relative(plan_path, root)
    spec = HTML_COMMENT_PATTERN.sub("", read_text(spec_path))
    plan = HTML_COMMENT_PATTERN.sub("", read_text(plan_path))

    def add(where: str, message: str) -> None:
        issues.append(Issue("kickoff", where, message))

    own = SPEC_ID_PATTERN.search(spec)
    if not own or own.group(1) != unit_id:
        add(spec_where, f"ID 应为 {unit_id}，实际 {own.group(1) if own else '缺失'}")
    status = SPEC_STATUS_PATTERN.search(spec)
    if not status or status.group(1) != "approved":
        add(spec_where, "规格还没批准：用户在编排会话批准后把状态改成 approved，再生成提示词")
    if not SPEC_APPROVED_DATE_PATTERN.search(spec) or not SPEC_APPROVAL_BASIS_PATTERN.search(spec):
        add(spec_where, "「批准记录」缺批准依据（用户原话）或批准时间")
    leftovers = [token for token in SPEC_TEMPLATE_LEFTOVERS if token in spec]
    if leftovers:
        add(spec_where, f"还留着模板字样：{' '.join(leftovers)}")
    ac_lines = AC_LINE_PATTERN.findall(markdown_section(spec, "验收标准"))
    if not ac_lines:
        add(spec_where, "「验收标准」一条 AC 都没有")
    for line in ac_lines:
        if not AC_FILLED_PATTERN.match(line):
            add(spec_where, f"AC 缺标签或没写内容（括号里只放标签，修订说明写在正文末尾）：{line[:40]}")
    first_line = next((line.strip() for line in markdown_section(spec, "验收方式").splitlines() if line.strip()), "")
    modes = [mode for mode, text in ACCEPTANCE_MODES.items() if text in first_line]
    if len(modes) != 1:
        add(spec_where, "验收方式没定：「验收方式」第一行只留 `A 人工验收` 或 `B Agent 验收` 其中一个")
    if in_relay and not RELAY_PROBE_PATTERN.search(spec):
        add(spec_where, "接力线上的单元，「批准记录」要有带日期的接力探针行（docs/howto/relay.md）")

    work = WORK_STATUS_PATTERN.search(plan)
    archive = ARCHIVE_STATUS_PATTERN.search(plan)
    work_status = work.group(1) if work else ""
    if archive and archive.group(1) == "archived":
        add(plan_where, "单元已归档")
    elif work_status not in KICKOFF_WORK_STATUSES:
        add(plan_where, f"工作单元状态是 {work_status or '缺失'}：批准后改成 approved 才能开工")
    rows = [split_table_row(line) for line in markdown_section(plan, "任务表").splitlines() if TASK_ROW_PATTERN.match(line)]
    if not any(len(row) > 1 and row[1] for row in rows):
        add(plan_where, "任务表没有任务")
    elif work_status == "approved" and len(rows) > MAX_APPROVED_TASKS:
        add(plan_where, f"任务表 {len(rows)} 行，批准时不超过 {MAX_APPROVED_TASKS} 行：拆单元")
    if PARALLEL_GROUP_PATTERN.search(plan):
        add(plan_where, "并行组的单元不用这条命令，提示词在 docs/howto/parallel.md 第 2 节")
    return modes[0] if len(modes) == 1 else ""


def is_same_sitting(modes: list[str]) -> bool:
    """两个方式 A 单元串行、同场验收（docs/howto/relay.md「同场验收」）。"""
    return modes == ["A", "A"]


def check_kickoff(root: Path, unit_ids: list[str], issues: list[Issue]) -> list[str]:
    """一个单元号是单独开工；多个按给出的顺序当一条接力线，加查 docs/howto/relay.md 的排线规矩。返回各单元的验收方式。"""
    malformed = [unit_id for unit_id in unit_ids if not UNIT_ID_PATTERN.fullmatch(unit_id)]
    if malformed or len(set(unit_ids)) != len(unit_ids):
        issues.append(Issue("kickoff", "--kickoff", f"单元号写错或重复：{' '.join(unit_ids)}"))
        return []
    in_relay = len(unit_ids) > 1
    modes = [check_kickoff_unit(root, unit_id, issues, in_relay=in_relay) for unit_id in unit_ids]
    if not in_relay:
        return modes
    if not is_same_sitting(modes):
        for unit_id, mode in zip(unit_ids[:-1], modes[:-1]):
            if mode == "A":
                issues.append(
                    Issue("kickoff", unit_id, "方式 A 的单元只能在线尾，一条线最多一个；只有两个 A 单元时走同场验收")
                )
        if len(unit_ids) == 2 and modes[-1] == "A":
            issues.append(
                Issue(
                    "kickoff",
                    "--kickoff",
                    "不够接力门槛（至少 3 个单元、2 个连续的方式 B，或 2 个方式 A 同场验收）：逐个开会话",
                )
            )
    error, dirty = worktree_changes(root)
    if error or dirty:
        detail = error or f"{len(dirty)} 项未提交：{'; '.join(dirty[:5])}"
        issues.append(Issue("kickoff", ".", f"接力开工要求工作树干净，先提交编排产物（{detail}）"))
    return modes


def kickoff_prompt(unit_ids: list[str], modes: list[str] | None = None) -> str:
    """只写内核不知道的事：哪个单元、是不是接力。规则和讨论内容不进提示词。"""
    if len(unit_ids) == 1:
        return f"执行 {unit_ids[0]}。"
    if is_same_sitting(modes or []):
        return f"执行 {unit_ids[0]}，交接后接着做 {unit_ids[1]}，两个同场验收，按 docs/howto/relay.md「同场验收」。"
    return f"执行 {unit_ids[0]}，自动接力到 {unit_ids[-1]}，按 docs/howto/relay.md。"
