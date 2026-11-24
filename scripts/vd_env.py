# -*- coding: utf-8 -*-
"""配置键契约与 --env-keys（`validate_docs.py` 的一部分，入口和检查清单在那里）。"""
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


# 配置键契约（scripts/workflow.conf 的 env-* 行驱动；一行都不配就不检查）

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


def check_env_tracked(root: Path, issues: list[Issue]) -> None:
    """`env-untracked on` 时，`*.example` 以外的 `.env*` 不得被 Git 跟踪。"""
    rows = read_workflow_conf_rows(root, "env-untracked")
    if not rows or rows[-1][:1] != ["on"]:
        return
    for name in git_tracked_files(root) or []:
        base = name.rsplit("/", 1)[-1]
        if base.startswith(".env") and not base.endswith(".example"):
            issues.append(Issue("env-tracked", name, "本地配置文件被 Git 跟踪；git rm --cached 后保留本地文件"))


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
