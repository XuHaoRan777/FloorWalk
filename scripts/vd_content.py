# -*- coding: utf-8 -*-
"""文档内容：明文凭据、链接、指向工作单元的链接（`validate_docs.py` 的一部分，入口和检查清单在那里）。"""
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
    re.compile(r"\.{3,}|…+"),
)


def is_sensitive_key(key: str) -> bool:
    normalized = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", key)
    parts = [part for part in re.split(r"[^A-Za-z0-9]+", normalized.lower()) if part]
    return any(part in SENSITIVE_KEY_PARTS for part in parts)


def is_safe_placeholder(value: str) -> bool:
    return any(pattern.fullmatch(value) for pattern in SAFE_VALUE_PATTERNS)


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
