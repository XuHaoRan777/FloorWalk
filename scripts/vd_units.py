# -*- coding: utf-8 -*-
"""工作单元、Backlog、回修、testlog、内核字数、跨单元 AC（`validate_docs.py` 的一部分，入口和检查清单在那里）。"""
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


def check_work_units(root: Path, issues: list[Issue]) -> dict[str, tuple[str, str]]:
    """返回 {目录名: (归档状态, 工作单元状态)}，只收录状态合法的单元。"""
    states: dict[str, tuple[str, str]] = {}
    work_root = root / "docs/work"
    if not work_root.is_dir():
        return states
    seen_ids: dict[str, str] = {}
    for unit in sorted(work_root.iterdir()):
        if not unit.is_dir() or unit.name == "_template":
            continue
        where = relative(unit, root)
        match = WORK_UNIT_DIRECTORY_PATTERN.fullmatch(unit.name)
        if not match:
            issues.append(Issue("unit-id", where, "目录名必须是 <PREFIX>-NNN-lowercase-slug"))
            continue
        stable_id = match.group(1)
        if stable_id in seen_ids:
            issues.append(Issue("unit-id", where, f"{stable_id} 已被 {seen_ids[stable_id]} 使用"))
        seen_ids[stable_id] = unit.name

        spec_path = unit / "spec.md"
        if not spec_path.is_file():
            issues.append(Issue("unit-file", where, "缺少 spec.md"))
        else:
            spec_match = SPEC_STATUS_PATTERN.search(read_text(spec_path))
            if not spec_match or spec_match.group(1) not in VALID_SPEC_STATUSES:
                issues.append(Issue("spec-status", relative(spec_path, root), "规格状态缺失或非法"))

        plan_path = unit / "plan.md"
        if not plan_path.is_file():
            issues.append(Issue("unit-file", where, "缺少 plan.md"))
            continue
        plan = read_text(plan_path)
        plan_where = relative(plan_path, root)
        work_match = WORK_STATUS_PATTERN.search(plan)
        archive_match = ARCHIVE_STATUS_PATTERN.search(plan)
        work_status = work_match.group(1) if work_match else ""
        archive_status = archive_match.group(1) if archive_match else ""
        if work_status not in VALID_WORK_STATUSES:
            issues.append(Issue("work-status", plan_where, f"工作单元状态缺失或非法：{work_status or '缺失'}"))
        if archive_status not in VALID_ARCHIVE_STATUSES:
            issues.append(Issue("archive-status", plan_where, f"归档状态缺失或非法：{archive_status or '缺失'}"))
        if archive_status == "archived" and work_status not in ARCHIVABLE_WORK_STATUSES:
            issues.append(
                Issue("archive-status", plan_where, f"archived 只能配 verified 或 descoped，当前 {work_status}")
            )
        if work_status in VALID_WORK_STATUSES and archive_status in VALID_ARCHIVE_STATUSES:
            states[unit.name] = (archive_status, work_status)
    active = sorted(name for name, (archive, _) in states.items() if archive == "active")
    # 上限默认 MAX_ACTIVE_UNITS；workflow.conf 的 active-units-max 可改（并行组批准时调高，收组改回）
    raw = (read_workflow_conf(root) or {}).get("active-units-max", [""])[-1]
    limit = int(raw) if raw.isdigit() else MAX_ACTIVE_UNITS
    if len(active) > limit:
        issues.append(
            Issue("active-units", "docs/work", f"同时 active 的单元 {len(active)} 个，上限 {limit}：{', '.join(active)}")
        )
    return states


# 跨单元引用 AC：「XX-005 AC-02」「XX-005 的 AC-02」。
CROSS_UNIT_AC_PATTERN = re.compile(r"\b([A-Z][A-Z0-9]{1,5}-\d{3})\s*(?:的\s*)?(AC-\d+)\b")


def check_cross_unit_ac(root: Path, issues: list[Issue]) -> None:
    """未归档单元的 spec 正文（注释外）不得引用别的单元的 AC；只查 `cross-unit-ac-since` 当天及以后批准或尚未批准的。"""
    since_rows = read_workflow_conf_rows(root, "cross-unit-ac-since")
    since = since_rows[-1][0] if since_rows and since_rows[-1] else ""
    work_root = root / "docs/work"
    if not work_root.is_dir():
        return
    for spec_path in sorted(work_root.glob("*/spec.md")):
        plan_path = spec_path.with_name("plan.md")
        if plan_path.is_file():
            archive = ARCHIVE_STATUS_PATTERN.search(read_text(plan_path))
            if archive and archive.group(1) == "archived":
                continue
        content = read_text(spec_path)
        approved = SPEC_APPROVED_DATE_PATTERN.search(content)
        if since and approved and approved.group(1) < since:
            continue
        own = SPEC_ID_PATTERN.search(content)
        own_id = own.group(1) if own else ""
        body = HTML_COMMENT_PATTERN.sub("", markdown_without_fenced_code(content))
        for match in CROSS_UNIT_AC_PATTERN.finditer(body):
            if match.group(1) != own_id:
                issues.append(
                    Issue(
                        "cross-unit-ac",
                        relative(spec_path, root),
                        f"引用了 {match.group(1)} {match.group(2)}：人工项留在本单元，不挪进别的单元",
                    )
                )


def check_testlog(root: Path, issues: list[Issue], *, today: _dt.date) -> None:
    """`待同步` 行数与缓冲里最早一行的年龄不得超过预算。"""
    path = root / "docs/testlog.md"
    if not path.is_file():
        return
    where = "docs/testlog.md"
    dates: list[_dt.date] = []
    pending = 0
    for line in markdown_without_fenced_code(read_text(path)).splitlines():
        if not line.startswith("|"):
            continue
        cells = split_table_row(line)
        if len(cells) < 5 or not TESTLOG_DATE_PATTERN.match(cells[0]):
            continue
        dates.append(_dt.date.fromisoformat(cells[0]))
        if cells[4].startswith("待同步"):
            pending += 1
    if not dates:
        return
    if pending > MAX_PENDING_SYNC_ROWS:
        issues.append(Issue("testlog-debt", where, f"待同步 {pending} 条，上限 {MAX_PENDING_SYNC_ROWS}，该收一下了"))
    age = (today - min(dates)).days
    if age > MAX_TESTLOG_AGE_DAYS:
        issues.append(Issue("testlog-debt", where, f"最早一行已 {age} 天，上限 {MAX_TESTLOG_AGE_DAYS} 天，该收一下了"))


def check_kernel_size(root: Path, issues: list[Issue]) -> None:
    """内核字数不得超过 `kernel-max-chars`；上限缺失也报错，否则检查会悄悄消失。"""
    kernel = root / "AGENTS.md"
    if not kernel.is_file():
        return
    conf = read_workflow_conf(root)
    raw = (conf or {}).get("kernel-max-chars", [""])[-1]
    if not raw.isdigit():
        issues.append(Issue("kernel-size", WORKFLOW_CONF, "缺少 kernel-max-chars 或取值不是整数"))
        return
    limit = int(raw)
    size = len(read_text(kernel))
    if size > limit:
        issues.append(
            Issue(
                "kernel-size",
                "AGENTS.md",
                f"{size} 字，上限 {limit}：先删，或把按时机执行的步骤移进 docs/howto/，不调高上限",
            )
        )


def check_backlog(root: Path, states: dict[str, tuple[str, str]], issues: list[Issue]) -> None:
    backlog_path = root / "docs/backlog.md"
    where = "docs/backlog.md"
    if not backlog_path.is_file():
        issues.append(Issue("backlog", where, "缺少 docs/backlog.md"))
        return
    content = markdown_without_fenced_code(read_text(backlog_path))
    active = {name for name, (archive, _) in states.items() if archive == "active"}
    listed: set[str] = set()
    for row in parse_backlog_rows(content):
        if len(row) < 3:
            issues.append(Issue("backlog", where, f"行至少需要 ID、工作单元、状态三列：{row}"))
            continue
        link = BACKLOG_WORK_LINK_PATTERN.search(row[1])
        if not link:
            issues.append(Issue("backlog", where, f"行必须链接到工作单元 spec.md：{row[0]}"))
            continue
        name = link.group(1)
        listed.add(name)
        if name not in states:
            continue
        expected_id = WORK_UNIT_DIRECTORY_PATTERN.fullmatch(name).group(1)
        if row[0].strip("`") != expected_id:
            issues.append(Issue("backlog", where, f"{name} 的 ID 应为 {expected_id}，实际 {row[0]}"))
        expected_status = states[name][1]
        if row[2].strip("`") != expected_status:
            issues.append(
                Issue("backlog", where, f"{name} 状态应为 {expected_status}，实际 {row[2].strip('`')}{SYNC_HINT}")
            )
    for name in sorted(active - listed):
        issues.append(Issue("backlog", where, f"活动单元未登记：{name}{SYNC_HINT}"))
    for name in sorted(listed - active):
        issues.append(Issue("backlog", where, f"登记了非活动单元：{name}{SYNC_HINT}"))


SYNC_HINT = "（「当前工作」表不手改，文档校验加 --sync-backlog 按各 plan 重新生成）"


# 回修表（AGENTS.md 第 10 节）：表头有「状态」列的才查，旧格式的历史单元不受影响。
REWORK_STATUSES = {"做了", "延后"}


BACKLOG_QUEUE_PATTERN = re.compile(r"^## 待开单元[^\n]*\n(?P<body>.*?)(?=^## |\Z)", re.MULTILINE | re.DOTALL)


def check_rework(root: Path, states: dict[str, tuple[str, str]], issues: list[Issue]) -> None:
    """状态取值合法；`延后` 写了同意日期；没转进别的单元的延后，Backlog「待开单元」有同样多行注明本单元号。

    已归档且已提交的单元不查登记：那时延后的要求可能已经开成单元、从「待开单元」删掉了。
    """
    backlog_path = root / "docs/backlog.md"
    backlog = HTML_COMMENT_PATTERN.sub("", read_text(backlog_path)) if backlog_path.is_file() else ""
    queue = BACKLOG_QUEUE_PATTERN.search(backlog)
    queue_rows = table_rows(queue.group("body"))[1:] if queue else []
    for name, (archive_status, _) in sorted(states.items()):
        plan_path = root / "docs/work" / name / "plan.md"
        rows = table_rows(markdown_section(HTML_COMMENT_PATTERN.sub("", read_text(plan_path)), "回修"))
        if not rows or "状态" not in rows[0]:
            continue
        header, where = rows[0], relative(plan_path, root)
        own_id = WORK_UNIT_DIRECTORY_PATTERN.fullmatch(name).group(1)
        status_at = header.index("状态")
        target_at = next((index for index, cell in enumerate(header) if "去向" in cell), None)
        unrouted = 0
        for cells in rows[1:]:
            if not any(cells):
                continue
            status = cells[status_at].strip("` ") if status_at < len(cells) else ""
            if status not in REWORK_STATUSES:
                issues.append(Issue("rework", where, f"「回修」状态只能是 `做了` 或 `延后`：{status or '空'}"))
                continue
            if status == "做了":
                continue
            target = cells[target_at] if target_at is not None and target_at < len(cells) else ""
            if not ISO_DATE_PATTERN.search(target):
                issues.append(Issue("rework", where, "「回修」延后的行，「改动或去向」要写用户同意延后的日期"))
            if not any(found != own_id for found in UNIT_ID_PATTERN.findall(target)):
                unrouted += 1
        if not unrouted or (archive_status == "archived" and not has_uncommitted_changes(root, plan_path)):
            continue
        registered = sum(own_id in " ".join(cells) for cells in queue_rows)
        if registered < unrouted:
            issues.append(
                Issue(
                    "rework",
                    where,
                    f"「回修」{unrouted} 条延后，Backlog「待开单元」注明 {own_id} 的只有 {registered} 行：每条登记一行",
                )
            )
