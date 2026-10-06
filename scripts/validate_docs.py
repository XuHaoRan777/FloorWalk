#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""文档校验器。

只做机械检查，不做流程语义判断：

1. 文档不含明文凭据或私钥。
2. 文档内部相对链接可达（只检查指向 `docs/` 或根目录 Markdown 的链接；
   指向代码文件的链接不检查，历史单元指向已删除代码属正常现象）。
3. 每个工作单元有 `spec.md` 和 `plan.md`，状态字段取值合法，
   `archived` 只能配 `verified` 或 `descoped`；同时 `active` 的单元不超过 3 个。
4. Backlog 当前工作表与各单元 `plan.md` 的活动集合和状态一致。
5. `specs/`、`context/`、`adr/`、`pitfalls.md` 不链接到 `docs/work/`。
6. `docs/testlog.md` 的 `待同步` 行不超过 5 条，最早一行不超过 2 天。
7. `--archive-gate`：工作树必须干净。

`CLAUDE.md` 只含 `@AGENTS.md` 导入，不再需要内核同步检查。

用法：
    python scripts/validate_docs.py [--root DIR] [--archive-gate] [--today YYYY-MM-DD]

退出码 0 表示通过，1 表示存在错误。
"""
from __future__ import annotations

import argparse
import datetime as _dt
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

WORK_UNIT_DIRECTORY_PATTERN = re.compile(r"^([A-Z][A-Z0-9]{1,5}-\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*$")
SPEC_STATUS_PATTERN = re.compile(r"^> 状态：`([^`]+)`\s*$", re.MULTILINE)
WORK_STATUS_PATTERN = re.compile(r"^- 工作单元状态：`([^`]+)`\s*$", re.MULTILINE)
ARCHIVE_STATUS_PATTERN = re.compile(r"^- 归档状态：`([^`]+)`\s*$", re.MULTILINE)
BACKLOG_WORK_LINK_PATTERN = re.compile(
    r"\]\(work/([A-Z][A-Z0-9]{1,5}-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*)/(?:spec|README)\.md\)"
)
EXTERNAL_LINK_PATTERN = re.compile(r"^[a-z][a-z0-9+.-]*:", re.IGNORECASE)

VALID_SPEC_STATUSES = {"draft", "approved"}
VALID_WORK_STATUSES = {"draft", "approved", "in_progress", "blocked", "verified", "descoped"}
# 可归档终态：`verified` 表示技术门禁通过，`descoped` 表示用户决定不再投入。
ARCHIVABLE_WORK_STATUSES = {"verified", "descoped"}
VALID_ARCHIVE_STATUSES = {"active", "archived"}
# 活动单元上限：超过就说明归档没发生，活动单元会被反复读。
MAX_ACTIVE_UNITS = 3
# 修正记录预算：`待同步` 条数或缓冲里最早一行的天数任一超限即报错，提示"收一下"。
MAX_PENDING_SYNC_ROWS = 5
MAX_TESTLOG_AGE_DAYS = 2
# 这些位置是"现在是什么"或长期基线，不得指向工作单元快照。
NO_WORK_LINK_PREFIXES = ("docs/specs/", "docs/context/", "docs/adr/", "docs/pitfalls.md")
TESTLOG_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")

PRIVATE_KEY_PATTERN = re.compile(
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", re.IGNORECASE
)
ASSIGNMENT_PATTERN = re.compile(
    r'''(?<![A-Za-z0-9_.-])(?P<key_quote>["']?)(?P<key>[A-Za-z][A-Za-z0-9_.-]*)'''
    r'''(?P=key_quote)\s*[:=]\s*(?P<value>"[^"\r\n]*"|'[^'\r\n]*'|[^\s`]+)'''
)
SENSITIVE_KEY_PARTS = {"password", "passwd", "secret", "token", "apikey", "accesskey"}
SAFE_VALUE_PATTERNS = (
    re.compile(r"<[^<>\s]+>"),
    re.compile(r"\$\{[A-Za-z_][A-Za-z0-9_]*\}"),
    re.compile(r"\{\{[^{}\s]+\}\}"),
    re.compile(r"\[REDACTED\]"),
    re.compile(r"REDACTED"),
    re.compile(r"\*\*\*"),
)


class Issue:
    """一条可定位的校验错误。"""

    def __init__(self, code: str, path: str, message: str) -> None:
        self.code = code
        self.path = path
        self.message = message

    def __str__(self) -> str:
        return f"[{self.code}] {self.path}: {self.message}"

    __repr__ = __str__


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def markdown_without_fenced_code(content: str) -> str:
    """把围栏代码块替换为空行，保留行号。"""
    output: list[str] = []
    fence = ""
    for line in content.splitlines(keepends=True):
        match = re.match(r"^\s{0,3}(`{3,}|~{3,})", line)
        newline = "\n" if line.endswith("\n") else ""
        if not fence and match:
            fence = match.group(1)
            output.append(newline)
            continue
        if fence and re.match(rf"^\s{{0,3}}{re.escape(fence[0])}{{{len(fence)},}}\s*$", line.strip("\r\n")):
            fence = ""
            output.append(newline)
            continue
        output.append(newline if fence else line)
    return "".join(output)


def iter_markdown_link_targets(content: str):
    """产出内联链接目标，支持目标中的成对括号。"""
    search_from = 0
    while True:
        marker = content.find("](", search_from)
        if marker == -1:
            return
        start = marker + 2
        if start < len(content) and content[start] == "<":
            end = content.find(">", start + 1)
            if end != -1 and end + 1 < len(content) and content[end + 1] == ")":
                yield content[start + 1 : end]
                search_from = end + 2
                continue
        depth = 1
        index = start
        while index < len(content):
            character = content[index]
            if character == "\\":
                index += 2
                continue
            if character == "(":
                depth += 1
            elif character == ")":
                depth -= 1
                if depth == 0:
                    yield content[start:index]
                    search_from = index + 1
                    break
            index += 1
        else:
            return


def link_destination(raw_target: str) -> str:
    """去掉可选的链接标题，只保留目标路径。"""
    match = re.fullmatch(
        r'''(?P<target>\S+?)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*''', raw_target.strip()
    )
    return match.group("target") if match else raw_target.strip()


def is_sensitive_key(key: str) -> bool:
    normalized = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", key)
    parts = [part for part in re.split(r"[^A-Za-z0-9]+", normalized.lower()) if part]
    return any(part in SENSITIVE_KEY_PARTS for part in parts)


def is_safe_placeholder(value: str) -> bool:
    return any(pattern.fullmatch(value) for pattern in SAFE_VALUE_PATTERNS)


def split_table_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def parse_backlog_rows(content: str) -> list[list[str]]:
    """解析 Backlog `## 当前工作` 下的表格数据行。"""
    section = re.search(
        r"^## 当前工作\s*$\n(?P<body>.*?)(?=^##\s|\Z)", content, re.MULTILINE | re.DOTALL
    )
    if not section:
        return []
    rows: list[list[str]] = []
    for line in section.group("body").splitlines():
        if not line.startswith("|"):
            continue
        cells = split_table_row(line)
        if cells and cells[0] != "ID" and not all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
            rows.append(cells)
    return rows


# ---------------------------------------------------------------------------
# 检查项
# ---------------------------------------------------------------------------


def check_sensitive(path: Path, content: str, root: Path, issues: list[Issue]) -> None:
    where = relative(path, root)
    if PRIVATE_KEY_PATTERN.search(content):
        issues.append(Issue("private-key", where, "文档中不得出现私钥"))
    for match in ASSIGNMENT_PATTERN.finditer(content):
        if not is_sensitive_key(match.group("key")):
            continue
        value = match.group("value")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if not is_safe_placeholder(value):
            issues.append(Issue("sensitive-value", where, f"{match.group('key')} 疑似明文值"))


def check_links(path: Path, content: str, root: Path, issues: list[Issue]) -> None:
    """只检查指向 `docs/` 或根目录 Markdown 的相对链接。"""
    where = relative(path, root)
    docs_root = (root / "docs").resolve()
    for raw in iter_markdown_link_targets(markdown_without_fenced_code(content)):
        target = unquote(link_destination(raw).partition("#")[0])
        if not target or EXTERNAL_LINK_PATTERN.match(target):
            continue
        resolved = (path.parent / target).resolve()
        in_docs = resolved == docs_root or docs_root in resolved.parents
        in_root_md = resolved.parent == root.resolve() and resolved.suffix.lower() == ".md"
        if (in_docs or in_root_md) and not resolved.exists():
            issues.append(Issue("broken-link", where, f"链接目标不存在：{target}"))


def check_no_work_links(path: Path, content: str, root: Path, issues: list[Issue]) -> None:
    """`specs/`、`context/`、`adr/`、`pitfalls.md` 不得链接到 `docs/work/`。"""
    where = relative(path, root)
    if not where.startswith(NO_WORK_LINK_PREFIXES):
        return
    work_root = (root / "docs/work").resolve()
    for raw in iter_markdown_link_targets(markdown_without_fenced_code(content)):
        target = unquote(link_destination(raw).partition("#")[0])
        if not target or EXTERNAL_LINK_PATTERN.match(target):
            continue
        resolved = (path.parent / target).resolve()
        if work_root in resolved.parents:
            issues.append(Issue("work-link", where, f"当前事实与长期基线不得指向工作单元：{target}"))


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
    if len(active) > MAX_ACTIVE_UNITS:
        issues.append(
            Issue("active-units", "docs/work", f"同时 active 的单元 {len(active)} 个，上限 {MAX_ACTIVE_UNITS}：{', '.join(active)}")
        )
    return states


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
                Issue("backlog", where, f"{name} 状态应为 {expected_status}，实际 {row[2].strip('`')}")
            )
    for name in sorted(active - listed):
        issues.append(Issue("backlog", where, f"活动单元未登记：{name}"))
    for name in sorted(listed - active):
        issues.append(Issue("backlog", where, f"登记了非活动单元：{name}"))


def check_worktree_clean(root: Path, issues: list[Issue]) -> None:
    try:
        result = subprocess.run(
            ["git", "status", "--short"], cwd=root, capture_output=True, text=True, check=False
        )
    except OSError as exc:
        issues.append(Issue("archive-gate", ".", f"无法执行 git status：{exc}"))
        return
    if result.returncode != 0:
        issues.append(Issue("archive-gate", ".", f"git status 退出码 {result.returncode}"))
        return
    dirty = [line for line in result.stdout.splitlines() if line.strip()]
    if dirty:
        issues.append(Issue("archive-gate", ".", f"工作树非干净，禁止归档（{len(dirty)} 项）：{'; '.join(dirty[:10])}"))


# ---------------------------------------------------------------------------


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
    check_testlog(root, issues, today=today)

    if archive_gate:
        check_worktree_clean(root, issues)
    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description="文档校验器")
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parents[1], help="仓库根目录"
    )
    parser.add_argument("--archive-gate", action="store_true", help="归档门：要求 git 工作树干净")
    parser.add_argument("--today", type=_dt.date.fromisoformat, default=None, help="覆盖当天日期（测试用）")
    args = parser.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    issues = validate_repository(args.root.resolve(), archive_gate=args.archive_gate, today=args.today)
    for issue in issues:
        print(issue)
    if issues:
        print(f"文档校验失败：{len(issues)} 个问题")
        return 1
    print("文档校验通过：0 个问题")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
