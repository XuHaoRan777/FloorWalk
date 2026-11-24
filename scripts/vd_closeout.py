# -*- coding: utf-8 -*-
"""收尾欠账与单元依赖：该归档没归档、归档产物、ADR 状态、下游依赖路径、Backlog 生成（`validate_docs.py` 的一部分）。"""
from __future__ import annotations

import re
from pathlib import Path

from vd_common import *  # noqa: F403
from vd_kickoff import PARALLEL_GROUP_PATTERN

DEPENDENCY_LINE_PATTERN = re.compile(r"^- ([A-Z][A-Z0-9]{1,5}-\d{3})(?:\s*[：:]\s*(?P<rest>.*))?$")
DEPENDENCY_SPLIT_PATTERN = re.compile(r"[、，,；;\s]+")
ARCHIVE_PRODUCT_PATTERN = re.compile(r"^- 归档产物：(?P<rest>.*)$", re.MULTILINE)
BACKTICK_PATTERN = re.compile(r"`([^`]+)`")
PROBE_DATE_PATTERN = re.compile(r"^- 接力探针[^\n]*?(\d{4}-\d{2}-\d{2})", re.MULTILINE)
ADR_FILE_PATTERN = re.compile(r"^\d{4}-[a-z0-9-]+\.md$")
ADR_STATUS_PATTERN = re.compile(r"^(?:>|-)\s*状态：\s*`?([a-z]+)", re.MULTILINE)
ADR_LINK_PATTERN = re.compile(r"\]\((?:\./)?(\d{4}-[a-z0-9-]+\.md)\)")
STATUS_WORD_PATTERN = re.compile(r"([a-z]+)")
SPEC_TITLE_PATTERN = re.compile(r"^# (.+)$", re.MULTILINE)
NEXT_STEP_PATTERN = re.compile(r"^- 下一步：[ \t]*(.*)$", re.MULTILINE)
CURRENT_WORK_PATTERN = re.compile(r"^## 当前工作[ \t]*\n(?P<body>.*?)(?=^## |\Z)", re.MULTILINE | re.DOTALL)
BACKLOG_HEADER = ["| ID | 工作单元 | 状态 | 依赖 | 下一步 |", "| --- | --- | --- | --- | --- |"]
# 收尾终态：verified 或 descoped 之后就该归档（AGENTS.md 第 11 节）。
CLOSED_WORK_STATUSES = {"verified", "descoped"}


def unit_dependencies(spec: str) -> list[tuple[str, list[str]]]:
    """spec「依赖」里的 [(单元号, [消费路径])]；路径只认像路径的词（带 / 或 .，不带占位符和通配符）。"""
    deps: list[tuple[str, list[str]]] = []
    for line in markdown_section(HTML_COMMENT_PATTERN.sub("", spec), "依赖").splitlines():
        match = DEPENDENCY_LINE_PATTERN.match(line.strip())
        if not match:
            continue
        rest = match.group("rest") or ""
        tokens = BACKTICK_PATTERN.findall(rest) or DEPENDENCY_SPLIT_PATTERN.split(rest)
        paths = [
            token.strip()
            for token in tokens
            if token.strip()
            and ("/" in token or "." in token)
            and not any(mark in token for mark in "<>*")
            and not token.startswith(("http://", "https://"))
        ]
        deps.append((match.group(1), paths))
    return deps


def read_unit(root: Path, name: str) -> tuple[str, str]:
    unit = root / "docs/work" / name
    spec = read_text(unit / "spec.md") if (unit / "spec.md").is_file() else ""
    plan = read_text(unit / "plan.md") if (unit / "plan.md").is_file() else ""
    return spec, plan


def unit_id_of(name: str) -> str:
    return WORK_UNIT_DIRECTORY_PATTERN.fullmatch(name).group(1)


def active_dependents(root: Path, states: dict[str, tuple[str, str]]) -> dict[str, list[str]]:
    """{被依赖的单元号: [依赖它的活动单元目录名]}。"""
    held: dict[str, list[str]] = {}
    for name, (archive, _) in sorted(states.items()):
        if archive != "active":
            continue
        for dep_id, _ in unit_dependencies(read_unit(root, name)[0]):
            if dep_id != unit_id_of(name):
                held.setdefault(dep_id, []).append(name)
    return held


def check_unarchived(root: Path, states: dict[str, tuple[str, str]], issues: list[Issue]) -> None:
    """已 verified/descoped、工作树干净却仍 active 的单元：收尾被跳过了。

    接力线中间的单元（有活动单元依赖它，或和别的活动单元有同一天的接力探针）和并行组的线上单元按规矩要等，不报。
    工作树有改动时可能正在归档，也不报。
    """
    error, dirty = worktree_changes(root)
    if error or dirty:
        return
    held = active_dependents(root, states)
    probes: dict[str, str] = {}
    for name, (archive, _) in states.items():
        match = PROBE_DATE_PATTERN.search(read_unit(root, name)[0]) if archive == "active" else None
        if match:
            probes[name] = match.group(1)
    for name, (archive, work) in sorted(states.items()):
        if archive != "active" or work not in CLOSED_WORK_STATUSES:
            continue
        if held.get(unit_id_of(name)) or PARALLEL_GROUP_PATTERN.search(read_unit(root, name)[1]):
            continue
        # 接力线上的单元不一定互相写「依赖」：同一天批准（探针日期相同）的单元还有别的活动着，就是线还没走完
        if name in probes and any(other != name and date == probes[name] for other, date in probes.items()):
            continue
        issues.append(
            Issue("unarchived", f"docs/work/{name}/plan.md", f"已 {work}、工作树干净，还没归档：按 docs/howto/archive.md 收尾")
        )


def check_archive_products(root: Path, states: dict[str, tuple[str, str]], issues: list[Issue]) -> None:
    """已归档单元的 spec「批准记录」里 `- 归档产物：` 列的文件都要在。"""
    for name, (archive, _) in sorted(states.items()):
        if archive != "archived":
            continue
        spec = HTML_COMMENT_PATTERN.sub("", read_unit(root, name)[0])
        for match in ARCHIVE_PRODUCT_PATTERN.finditer(spec):
            for path in BACKTICK_PATTERN.findall(match.group("rest")):
                if not (root / path).exists():
                    issues.append(Issue("archive-product", f"docs/work/{name}/spec.md", f"批准时说归档要写出 {path}，没有这个文件"))


def check_adr_index(root: Path, issues: list[Issue]) -> None:
    """ADR 文件头的状态和 `docs/adr/README.md` 索引表一致；索引表有「状态」列时，每个 ADR 都要在表里。"""
    adr_root = root / "docs/adr"
    index_path = adr_root / "README.md"
    if not index_path.is_file():
        return
    index: dict[str, str] = {}
    status_at: int | None = None
    for line in markdown_without_fenced_code(read_text(index_path)).splitlines():
        if not line.startswith("|"):
            continue
        cells = split_table_row(line)
        if "状态" in cells:
            status_at = cells.index("状态")
            continue
        link = ADR_LINK_PATTERN.search(line)
        if link and status_at is not None and status_at < len(cells):
            word = STATUS_WORD_PATTERN.search(cells[status_at])
            index[link.group(1)] = word.group(1) if word else ""
    if status_at is None:
        return
    for path in sorted(adr_root.iterdir()):
        if not ADR_FILE_PATTERN.match(path.name):
            continue
        header = ADR_STATUS_PATTERN.search(read_text(path))
        if not header:
            continue
        where = f"docs/adr/{path.name}"
        if path.name not in index:
            issues.append(Issue("adr-index", where, "docs/adr/README.md 的索引表里没有这份 ADR"))
        elif index[path.name] != header.group(1):
            issues.append(
                Issue("adr-index", where, f"文件头状态是 {header.group(1)}，索引表写的是 {index[path.name] or '空'}")
            )


def check_dependency_paths(root: Path, states: dict[str, tuple[str, str]], issues: list[Issue]) -> None:
    """活动单元「依赖」列的消费路径：上游已交付（verified 或已归档）时必须存在，不在说明上游交付变了。"""
    by_id = {unit_id_of(name): state for name, state in states.items()}
    for name, (archive, _) in sorted(states.items()):
        if archive != "active":
            continue
        for dep_id, paths in unit_dependencies(read_unit(root, name)[0]):
            upstream = by_id.get(dep_id)
            if not upstream or not (upstream[0] == "archived" or upstream[1] == "verified"):
                continue
            for path in paths:
                if not (root / path).exists():
                    issues.append(
                        Issue(
                            "dependency-path",
                            f"docs/work/{name}/spec.md",
                            f"上游 {dep_id} 已交付，但这里要消费的 {path} 不存在：按 docs/howto/archive.md 复核下游 spec",
                        )
                    )


def report_downstream(root: Path, states: dict[str, tuple[str, str]], unit_id: str) -> int:
    """`--downstream <单元号>`：列出依赖它的活动单元和它们要消费的路径，供归档时复核。"""
    found = 0
    for name in active_dependents(root, states).get(unit_id, []):
        found += 1
        spec, _ = read_unit(root, name)
        spec_status = SPEC_STATUS_PATTERN.search(spec)
        paths = next((paths for dep_id, paths in unit_dependencies(spec) if dep_id == unit_id), [])
        listed = "、".join(f"{path}（{'在' if (root / path).exists() else '不在'}）" for path in paths) or "没写路径"
        print(f"{name}：spec {spec_status.group(1) if spec_status else '?'}，plan {states[name][1]}；消费 {listed}")
    if not found:
        print(f"没有依赖 {unit_id} 的活动单元")
    return 0


def backlog_rows(root: Path, states: dict[str, tuple[str, str]]) -> list[str]:
    """按各 plan 生成「当前工作」表的行。"""
    rows = list(BACKLOG_HEADER)
    for name, (archive, work) in sorted(states.items()):
        if archive != "active":
            continue
        spec, plan = read_unit(root, name)
        title = SPEC_TITLE_PATTERN.search(spec)
        deps = "、".join(dep_id for dep_id, _ in unit_dependencies(spec)) or "无"
        step = NEXT_STEP_PATTERN.search(plan)
        cell = (step.group(1).strip() if step else "").replace("|", "／")
        label = (title.group(1).strip() if title else name).replace("|", "／").replace("]", "】").replace("[", "【")
        rows.append(f"| {unit_id_of(name)} | [{label}](work/{name}/spec.md) | `{work}` | {deps} | {cell} |")
    return rows


def sync_backlog(root: Path, states: dict[str, tuple[str, str]]) -> str:
    """改写 `docs/backlog.md`「当前工作」里的表；返回空串表示成功，否则是原因。"""
    path = root / "docs/backlog.md"
    if not path.is_file():
        return "缺少 docs/backlog.md"
    content = read_text(path)
    section = CURRENT_WORK_PATTERN.search(content)
    if not section:
        return "docs/backlog.md 没有「## 当前工作」一节"
    lines = section.group("body").split("\n")
    first_table = next((index for index, line in enumerate(lines) if line.startswith("|")), None)
    table = backlog_rows(root, states)
    if first_table is None:
        while lines and not lines[-1].strip():
            lines.pop()
        new_body = "\n".join(lines + [""] + table + ["", ""])
    else:
        after = [line for line in lines[first_table:] if not line.startswith("|")]
        new_body = "\n".join(lines[:first_table] + table + after)
    new_content = content[: section.start("body")] + new_body + content[section.end("body") :]
    if new_content != content:
        path.write_text(new_content, encoding="utf-8", newline="\n")
    return ""
