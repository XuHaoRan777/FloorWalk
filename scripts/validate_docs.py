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

`CLAUDE.md` 只含 `@AGENTS.md` 导入，不再需要内核同步检查。`workflow.conf` 的
`hardline` 路径由 `scripts/hooks/commit-msg` 检查，不在这里。

用法：
    python scripts/validate_docs.py [--root DIR] [--archive-gate] [--today YYYY-MM-DD] [--env-keys]
    python scripts/validate_docs.py --kickoff <单元号> [<单元号>...]

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


# 回修表（AGENTS.md 第 10 节）：表头有「状态」列的才查，旧格式的历史单元不受影响。
REWORK_STATUSES = {"做了", "延后"}
ISO_DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")
TABLE_SEPARATOR_PATTERN = re.compile(r":?-{3,}:?")
BACKLOG_QUEUE_PATTERN = re.compile(r"^## 待开单元[^\n]*\n(?P<body>.*?)(?=^## |\Z)", re.MULTILINE | re.DOTALL)


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


def check_worktree_clean(root: Path, issues: list[Issue]) -> None:
    error, dirty = worktree_changes(root)
    if error:
        issues.append(Issue("archive-gate", ".", error))
    elif dirty:
        issues.append(Issue("archive-gate", ".", f"工作树非干净，禁止归档（{len(dirty)} 项）：{'; '.join(dirty[:10])}"))


def check_hooks_installed(root: Path, issues: list[Issue]) -> None:
    """仓库根带着钩子却没装（新克隆、换机器）时报错：归属、硬线、testlog 三项检查都靠它。"""
    if not (root / "scripts/hooks/commit-msg").is_file():
        return
    try:
        top = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=root, capture_output=True, text=True, check=False)
        if top.returncode != 0 or Path(top.stdout.strip()).resolve() != root.resolve():
            return
        configured = subprocess.run(
            ["git", "config", "--get", "core.hooksPath"], cwd=root, capture_output=True, text=True, check=False
        ).stdout.strip()
    except OSError:
        return
    if configured.replace("\\", "/").rstrip("/") != "scripts/hooks":
        issues.append(Issue("hooks", "scripts/hooks", "钩子没装：git config core.hooksPath scripts/hooks"))


def check_gate_records(root: Path, issues: list[Issue]) -> None:
    """登记了机器门时，当前代码要有 `scripts/gate.py` 记下的全绿记录。结果只认它的记录，不认 plan 里手写的。"""
    if not read_workflow_conf_rows(root, "gate"):
        return
    path = Path(__file__).with_name("gate.py")
    if not path.is_file():
        issues.append(Issue("archive-gate", WORKFLOW_CONF, "登记了 gate 行，但没有 scripts/gate.py"))
        return
    spec = importlib.util.spec_from_file_location("workflow_gate", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    for problem in module.archive_gate_problems(root):
        issues.append(Issue("archive-gate", ".", problem))


# ---------------------------------------------------------------------------
# 开工提示词（--kickoff，步骤见 docs/howto/open-unit.md）
# ---------------------------------------------------------------------------

UNIT_ID_PATTERN = re.compile(r"[A-Z][A-Z0-9]{1,5}-\d{3}")
AC_LINE_PATTERN = re.compile(r"^- AC-\d+.*$", re.MULTILINE)
# 只查有没有标签和内容，不枚举标签：项目可以有内核之外的标签（如立项出包的 `AI 定`）。
AC_FILLED_PATTERN = re.compile(r"^- AC-\d+（`[^`]+`）[：:]\s*\S")
ACCEPTANCE_MODES = {"A": "A 人工验收", "B": "B Agent 验收"}
TASK_ROW_PATTERN = re.compile(r"^\|\s*T\d+\s*\|")
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
)
RELAY_PROBE_PATTERN = re.compile(r"^- 接力探针.*\d{4}-\d{2}-\d{2}", re.MULTILINE)
PARALLEL_GROUP_PATTERN = re.compile(r"^- 并行组：", re.MULTILINE)


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


def check_kickoff(root: Path, unit_ids: list[str], issues: list[Issue]) -> None:
    """一个单元号是单独开工；多个按给出的顺序当一条接力线，加查 docs/howto/relay.md 的排线规矩。"""
    malformed = [unit_id for unit_id in unit_ids if not UNIT_ID_PATTERN.fullmatch(unit_id)]
    if malformed or len(set(unit_ids)) != len(unit_ids):
        issues.append(Issue("kickoff", "--kickoff", f"单元号写错或重复：{' '.join(unit_ids)}"))
        return
    in_relay = len(unit_ids) > 1
    modes = [check_kickoff_unit(root, unit_id, issues, in_relay=in_relay) for unit_id in unit_ids]
    if not in_relay:
        return
    for unit_id, mode in zip(unit_ids[:-1], modes[:-1]):
        if mode == "A":
            issues.append(Issue("kickoff", unit_id, "方式 A 的单元只能在线尾，一条线最多一个"))
    if len(unit_ids) == 2 and modes[-1] == "A":
        issues.append(
            Issue("kickoff", "--kickoff", "不够接力门槛（至少 3 个单元，或 2 个连续的方式 B）：逐个开会话")
        )
    error, dirty = worktree_changes(root)
    if error or dirty:
        detail = error or f"{len(dirty)} 项未提交：{'; '.join(dirty[:5])}"
        issues.append(Issue("kickoff", ".", f"接力开工要求工作树干净，先提交编排产物（{detail}）"))


def kickoff_prompt(unit_ids: list[str]) -> str:
    """只写内核不知道的事：哪个单元、是不是接力。规则和讨论内容不进提示词。"""
    if len(unit_ids) == 1:
        return f"执行 {unit_ids[0]}。"
    return f"执行 {unit_ids[0]}，自动接力到 {unit_ids[-1]}，按 docs/howto/relay.md。"


def report_kickoff(root: Path, unit_ids: list[str], *, today: _dt.date | None = None) -> int:
    """`--kickoff`：文档校验和开工检查都过了才打印提示词，否则列出问题。"""
    issues = validate_repository(root, today=today)
    check_kickoff(root, unit_ids, issues)
    for issue in issues:
        print(issue)
    if issues:
        print(f"还不能开工：{len(issues)} 个问题，不生成提示词")
        return 1
    print("开工提示词（在项目主目录开新会话，整段发送）：")
    print()
    print(kickoff_prompt(unit_ids))
    return 0


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
    check_rework(root, states, issues)
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
    args = parser.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    if args.env_keys:
        return report_env_keys(args.root.resolve())
    if args.kickoff:
        return report_kickoff(args.root.resolve(), args.kickoff, today=args.today)

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
