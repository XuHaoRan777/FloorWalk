# -*- coding: utf-8 -*-
"""公共的模式、读写与表格解析（`validate_docs.py` 的一部分，入口和检查清单在那里）。"""
from __future__ import annotations

import ast
import datetime as _dt
import importlib.util
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


# 机械阈值与硬线路径表，校验器与 commit-msg 钩子共用。
WORKFLOW_CONF = "scripts/workflow.conf"


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


def split_table_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def read_workflow_conf(root: Path) -> dict[str, list[str]] | None:
    """读取 `scripts/workflow.conf`：每行「键 值」，`#` 开头为注释，同一个键可出现多次。

    值只取第一个空白分隔的词，与钩子的解析一致。文件不存在时返回 None。
    """
    path = root / WORKFLOW_CONF
    if not path.is_file():
        return None
    values: dict[str, list[str]] = {}
    for line in read_text(path).splitlines():
        parts = line.split()
        if not parts or parts[0].startswith("#"):
            continue
        values.setdefault(parts[0], []).append(parts[1] if len(parts) > 1 else "")
    return values


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


SPEC_ID_PATTERN = re.compile(r"^> ID：`([^`]+)`", re.MULTILINE)


SPEC_APPROVED_DATE_PATTERN = re.compile(r"^- 批准时间：`(\d{4}-\d{2}-\d{2})`", re.MULTILINE)


HTML_COMMENT_PATTERN = re.compile(r"<!--.*?-->", re.DOTALL)


def read_workflow_conf_rows(root: Path, key: str) -> list[list[str]]:
    """返回 `workflow.conf` 里以 `key` 开头的每一行其余的词（`read_workflow_conf` 只取第一个值）。"""
    path = root / WORKFLOW_CONF
    if not path.is_file():
        return []
    rows: list[list[str]] = []
    for line in read_text(path).splitlines():
        parts = line.split("#", 1)[0].split()
        if parts and parts[0] == key:
            rows.append(parts[1:])
    return rows


def git_tracked_files(root: Path) -> list[str] | None:
    """`git ls-files` 的结果；不是仓库或 git 不可用时返回 None。"""
    try:
        result = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True, check=False)
    except OSError:
        return None
    return result.stdout.splitlines() if result.returncode == 0 else None


ISO_DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")


TABLE_SEPARATOR_PATTERN = re.compile(r":?-{3,}:?")


def table_rows(section: str) -> list[list[str]]:
    """一段 Markdown 里的表格行（含表头），跳过分隔行。"""
    rows: list[list[str]] = []
    for line in section.splitlines():
        if not line.startswith("|"):
            continue
        cells = split_table_row(line)
        if not all(TABLE_SEPARATOR_PATTERN.fullmatch(cell) for cell in cells):
            rows.append(cells)
    return rows


def has_uncommitted_changes(root: Path, path: Path) -> bool:
    """文件相对 HEAD 有改动；不是 git 仓库或还没有提交时当作没有。"""
    try:
        result = subprocess.run(
            ["git", "diff", "--quiet", "HEAD", "--", relative(path, root)], cwd=root, capture_output=True, check=False
        )
    except OSError:
        return False
    return result.returncode == 1


def worktree_changes(root: Path) -> tuple[str, list[str]]:
    """(`git status` 跑不了时的原因, 未提交的条目)。"""
    try:
        result = subprocess.run(
            ["git", "status", "--short"], cwd=root, capture_output=True, text=True, check=False
        )
    except OSError as exc:
        return f"无法执行 git status：{exc}", []
    if result.returncode != 0:
        return f"git status 退出码 {result.returncode}", []
    return "", [line for line in result.stdout.splitlines() if line.strip()]


# 开工提示词（--kickoff，步骤见 docs/howto/open-unit.md）

UNIT_ID_PATTERN = re.compile(r"[A-Z][A-Z0-9]{1,5}-\d{3}")


TASK_ROW_PATTERN = re.compile(r"^\|\s*T\d+\s*\|")


def markdown_section(content: str, title: str) -> str:
    """`## title` 到下一个二级标题之间的正文；没有这一节返回空串。"""
    match = re.search(
        rf"^## {re.escape(title)}[ \t]*\n(?P<body>.*?)(?=^## |\Z)", content, re.MULTILINE | re.DOTALL
    )
    return match.group("body") if match else ""


def find_unit_dir(root: Path, unit_id: str) -> Path | None:
    work_root = root / "docs/work"
    if not work_root.is_dir():
        return None
    matches = [path for path in sorted(work_root.iterdir()) if path.is_dir() and path.name.startswith(f"{unit_id}-")]
    return matches[0] if len(matches) == 1 else None
