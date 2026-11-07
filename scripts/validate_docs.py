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
8. `--archive-gate`：工作树必须干净。
9. 未归档、在 `cross-unit-ac-since` 当天及以后批准（或未批准）的 `spec.md` 不引用别的单元的 AC。
10. 配置键契约（`workflow.conf` 配了 `env-*` 才查）：模板键有属性注释、被引用到；
    无默认值的引用键在模板里；`env-untracked on` 时 `.env*` 不被 Git 跟踪。
11. `--env-keys`：只报本地配置文件缺的键名，从不打印值。

`CLAUDE.md` 只含 `@AGENTS.md` 导入，不再需要内核同步检查。`workflow.conf` 的
`hardline` 路径由 `scripts/hooks/commit-msg` 检查，不在这里。

用法：
    python scripts/validate_docs.py [--root DIR] [--archive-gate] [--today YYYY-MM-DD] [--env-keys]

退出码 0 表示通过，1 表示存在错误。
"""
from __future__ import annotations

import argparse
import ast
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
# 机械阈值与硬线路径表，校验器与 commit-msg 钩子共用。
WORKFLOW_CONF = "scripts/workflow.conf"

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
    # 上限默认 MAX_ACTIVE_UNITS；workflow.conf 的 active-units-max 可改（并行组批准时调高，收组改回）
    raw = (read_workflow_conf(root) or {}).get("active-units-max", [""])[-1]
    limit = int(raw) if raw.isdigit() else MAX_ACTIVE_UNITS
    if len(active) > limit:
        issues.append(
            Issue("active-units", "docs/work", f"同时 active 的单元 {len(active)} 个，上限 {limit}：{', '.join(active)}")
        )
    return states


# ---------------------------------------------------------------------------
# 配置键契约（scripts/workflow.conf 的 env-* 行驱动；一行都不配就不检查）
# ---------------------------------------------------------------------------

ENV_EXAMPLE_KEY_PATTERN = re.compile(r"^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=")
ENV_ATTR_PATTERN = re.compile(r"^\s*#\s*凭据：(?:是|否)；缺失：(?:启动失败|用默认值|功能关闭)")
# 占位符：${K}、${K:x}、${K:-x}、{$K}、{$K:x}；以 } 直接结束的视为无默认值、必填。
ENV_PLACEHOLDER_PATTERN = re.compile(r"\$\{([A-Z][A-Z0-9_]*)(\}|:)|\{\$([A-Z][A-Z0-9_]*)(\}|:)")
ENV_JS_PATTERN = re.compile(r"\b(?:import\.meta\.env|process\.env|env)\.([A-Z][A-Z0-9_]*)\b")
# 代码文件里的 ${...} 是字符串插值，不是配置占位符；只在这些后缀、文件名里认占位符。
ENV_CONFIG_SUFFIXES = {".yml", ".yaml", ".properties", ".toml", ".conf", ".env", ".json", ".xml"}
ENV_CONFIG_NAMES = {"caddyfile", "dockerfile", "docker-compose.yml", "compose.yml"}
ENV_CODE_SUFFIXES = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte"}
ENV_PY_REQUIRED_PATTERN = re.compile(r"os\.environ\[\s*[\"']([A-Z][A-Z0-9_]*)[\"']\s*\]")
ENV_PY_OPTIONAL_PATTERN = re.compile(r"os\.(?:getenv|environ\.get)\(\s*[\"']([A-Z][A-Z0-9_]*)[\"']")
# 跨单元引用 AC：「XX-005 AC-02」「XX-005 的 AC-02」。
CROSS_UNIT_AC_PATTERN = re.compile(r"\b([A-Z][A-Z0-9]{1,5}-\d{3})\s*(?:的\s*)?(AC-\d+)\b")
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


def parse_env_example(content: str) -> list[tuple[str, int, str]]:
    """解析模板里未注释的键：(键, 行号, 紧邻上方注释块里的属性行，没有为空串)。不取值。"""
    keys: list[tuple[str, int, str]] = []
    comments: list[str] = []
    for number, line in enumerate(content.splitlines(), start=1):
        if line.lstrip().startswith("#"):
            comments.append(line)
            continue
        match = ENV_EXAMPLE_KEY_PATTERN.match(line)
        if match:
            keys.append((match.group(1), number, next((c for c in comments if ENV_ATTR_PATTERN.match(c)), "")))
        comments = []
    return keys


def python_settings_keys(content: str) -> dict[str, bool]:
    """取继承 *Settings 的类的注解字段，转大写为键；没有默认值的算必填。语法错误返回空。"""
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return {}
    keys: dict[str, bool] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        if not any("Settings" in ast.unparse(base) for base in node.bases):
            continue
        for item in node.body:
            if not (isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name)):
                continue
            name = item.target.id
            if name.startswith("_") or name == "model_config" or "ClassVar" in ast.unparse(item.annotation):
                continue
            key = name.upper()
            keys[key] = keys.get(key, False) or item.value is None
    return keys


def collect_env_references(path: Path, declared: frozenset[str] = frozenset()) -> dict[str, bool]:
    """返回 {键: 是否必填}，同一个键任一处必填即必填。读不了的文件（二进制、非 UTF-8）跳过。

    JS/TS 常经一层解析函数读键（`source.VITE_X`），所以模板已声明的键在代码里以完整单词出现即算读到；
    这只用来消除死键误报，不会让未声明的键报缺。
    """
    try:
        content = read_text(path)
    except (OSError, UnicodeDecodeError):
        return {}
    refs: dict[str, bool] = {}

    def add(key: str, required: bool) -> None:
        refs[key] = refs.get(key, False) or required

    name = path.name.lower()
    if path.suffix.lower() in ENV_CONFIG_SUFFIXES or name in ENV_CONFIG_NAMES or name.startswith("caddyfile"):
        for match in ENV_PLACEHOLDER_PATTERN.finditer(content):
            add(match.group(1) or match.group(3), (match.group(2) or match.group(4)) == "}")
    if path.suffix.lower() in ENV_CODE_SUFFIXES:
        for match in ENV_JS_PATTERN.finditer(content):
            add(match.group(1), False)  # JS 看不出默认值，只证明键被读到，不据此报缺
        for key in declared:
            if re.search(rf"\b{re.escape(key)}\b", content):
                add(key, False)
    if path.suffix == ".py":
        for match in ENV_PY_REQUIRED_PATTERN.finditer(content):
            add(match.group(1), True)
        for match in ENV_PY_OPTIONAL_PATTERN.finditer(content):
            add(match.group(1), False)
        for key, required in python_settings_keys(content).items():
            add(key, required)
    return refs


def env_groups(root: Path) -> list[tuple[str, list[Path]]]:
    """`env-group <模板> <引用 glob>...` → (模板, 引用文件)。glob 相对仓库根，`**` 跨目录。"""
    groups: list[tuple[str, list[Path]]] = []
    for row in read_workflow_conf_rows(root, "env-group"):
        if not row:
            continue
        files: set[Path] = set()
        for pattern in row[1:]:
            files.update(p for p in root.glob(pattern) if p.is_file())
        groups.append((row[0], sorted(files)))
    return groups


def check_env_contract(root: Path, issues: list[Issue]) -> None:
    """模板键、代码引用、属性注释三方对账；只读模板和引用文件，不打开本地 `.env`。"""
    ignored = {row[0] for row in read_workflow_conf_rows(root, "env-ignore") if row}
    for example, ref_files in env_groups(root):
        if not (root / example).is_file():
            issues.append(Issue("env-group", WORKFLOW_CONF, f"env-group 的模板不存在：{example}"))
            continue
        declared = parse_env_example(read_text(root / example))
        names = {key for key, _, _ in declared}
        refs: dict[str, bool] = {}
        for ref in ref_files:
            for key, required in collect_env_references(ref, frozenset(names)).items():
                refs[key] = refs.get(key, False) or required
        for key, number, attr in declared:
            if not attr:
                issues.append(Issue("env-attr", f"{example}:{number}", f"{key} 上方缺属性注释（# 凭据：是|否；缺失：…）"))
            if key not in refs and key not in ignored:
                issues.append(Issue("env-dead-key", f"{example}:{number}", f"{key} 没有被本组任何引用文件读到"))
        for key, required in sorted(refs.items()):
            if required and key not in names and key not in ignored:
                issues.append(Issue("env-missing-key", example, f"{key} 被引用且无默认值，模板里没有"))


def git_tracked_files(root: Path) -> list[str] | None:
    """`git ls-files` 的结果；不是仓库或 git 不可用时返回 None。"""
    try:
        result = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True, check=False)
    except OSError:
        return None
    return result.stdout.splitlines() if result.returncode == 0 else None


def check_env_tracked(root: Path, issues: list[Issue]) -> None:
    """`env-untracked on` 时，`*.example` 以外的 `.env*` 不得被 Git 跟踪。"""
    rows = read_workflow_conf_rows(root, "env-untracked")
    if not rows or rows[-1][:1] != ["on"]:
        return
    for name in git_tracked_files(root) or []:
        base = name.rsplit("/", 1)[-1]
        if base.startswith(".env") and not base.endswith(".example"):
            issues.append(Issue("env-tracked", name, "本地配置文件被 Git 跟踪；git rm --cached 后保留本地文件"))


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


def local_env_files(root: Path) -> list[tuple[str, str]]:
    """(本地文件, 模板)：`env-local <本地> <模板>` 优先，否则每个 env-group 模板去掉 `.example` 后缀。"""
    pairs = [(row[0], row[1]) for row in read_workflow_conf_rows(root, "env-local") if len(row) >= 2]
    covered = {example for _, example in pairs}
    for example, _ in env_groups(root):
        if example not in covered and example.endswith(".example"):
            pairs.append((example[: -len(".example")], example))
    return pairs


def report_env_keys(root: Path) -> int:
    """`--env-keys`：本地文件缺了模板里标「缺失：启动失败」或没标属性的键时报出键名。

    在进程内只匹配行首的键名，从不保存或打印值；Agent 用它代替自己打开 `.env*`。
    """
    missing_total = 0
    pairs = local_env_files(root)
    if not pairs:
        print("workflow.conf 没有 env-group 或 env-local，无可检查的本地配置")
        return 0
    for local, example in pairs:
        if not (root / example).is_file():
            print(f"[env-keys] {example}: 模板不存在")
            missing_total += 1
            continue
        local_path = root / local
        if not local_path.is_file():
            print(f"[env-keys] {local}: 本地文件不存在（模板 {example}）")
            missing_total += 1
            continue
        present = set()
        for line in local_path.read_text(encoding="utf-8", errors="replace").splitlines():
            match = ENV_EXAMPLE_KEY_PATTERN.match(line)
            if match:
                present.add(match.group(1))
        declared = parse_env_example(read_text(root / example))
        for key, _, attr in declared:
            if key in present:
                continue
            if "缺失：用默认值" not in attr and "缺失：功能关闭" not in attr:
                print(f"[env-keys] {local}: 缺 {key}")
                missing_total += 1
        extra = sorted(present - {key for key, _, _ in declared})
        if extra:
            print(f"[env-keys] {local}: 模板里没有的键（只提示）：{', '.join(extra)}")
    print(f"本地配置检查：{missing_total} 个缺失")
    return 1 if missing_total else 0


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
    check_kernel_size(root, issues)
    check_cross_unit_ac(root, issues)
    check_env_contract(root, issues)
    check_env_tracked(root, issues)

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
    parser.add_argument("--env-keys", action="store_true", help="只检查本地配置文件缺不缺键，只打印键名")
    args = parser.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    if args.env_keys:
        return report_env_keys(args.root.resolve())

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
