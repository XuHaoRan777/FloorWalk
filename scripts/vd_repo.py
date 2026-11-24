# -*- coding: utf-8 -*-
"""仓库状态：工作树、钩子、机器门记录（`validate_docs.py` 的一部分，入口和检查清单在那里）。"""
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
