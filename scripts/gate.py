#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""机器门：跑 `scripts/workflow.conf` 登记的命令，结果由脚本记录，不由 Agent 手写。

`workflow.conf` 里每行 `gate <名字> <命令>`。命令在仓库根由系统 shell 执行（Windows 上是 cmd），
退出码 0 算过；整行余下的部分都是命令，不能带行尾注释。输出写进日志文件，失败时只打印末尾，
不把整份输出灌进对话。

记录放在 git 目录里（不入库），按「代码指纹」存：指纹是工作区里 `docs/`、`*.md` 和
`scripts/workflow.conf` 之外的代码文件（已跟踪的，加未被忽略的新文件）的内容摘要，按 git 的换行规则求。
所以只改文档的提交（归档提交）不让记录失效；在未提交的代码上跑过、之后原样提交的，记录照样算数；
代码内容一变，记录就不算了。每次运行另外追加一行到同目录的 `history.jsonl`（时间、门、用时、是否全量），
只增不删，复盘用；它写在各工作树共用的 git 目录里。不带门名（全量）跑、`in_progress` 单元还有未完成的任务时
打印一行提示，照样跑。

`validate_docs.py --archive-gate` 用 `archive_gate_problems` 核对：登记的每个门在当前代码上都跑过且通过。
红门只有两条路：修，或由用户登记 `gate-known-red <名字> <日期与原因>`（照跑照报，不拦归档）。

用法：
    python scripts/gate.py              跑全部门
    python scripts/gate.py types api    只跑这几个
    python scripts/gate.py --status     当前代码上各门的记录，不跑
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import locale
import re
import subprocess
import sys
import time
from pathlib import Path

WORKFLOW_CONF = "scripts/workflow.conf"
GATE_NAME_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]*")
# 失败时打印的日志行数，和保留多少个代码指纹的记录。
TAIL_LINES = 40
MAX_FINGERPRINTS = 20
HISTORY_FILE = "history.jsonl"
IN_PROGRESS_PLAN_PATTERN = re.compile(r"^- 工作单元状态：`in_progress`", re.MULTILINE)
TASK_STATUS_PATTERN = re.compile(r"^\|\s*(T\d+)\s*\|[^|\n]*\|\s*`?([a-z_]+)`?\s*\|", re.MULTILINE)


class ConfigError(Exception):
    pass


def git(root: Path, *args: str, stdin: str | None = None) -> str | None:
    """git 输出；命令失败或没有 git 时返回 None。"""
    try:
        result = subprocess.run(
            ["git", "-c", "core.quotepath=off", *args],
            cwd=root, input=stdin, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False,
        )
    except OSError:
        return None
    return result.stdout if result.returncode == 0 else None


def read_gates(root: Path) -> tuple[list[tuple[str, str]], dict[str, str]]:
    """返回 ([(名字, 命令)], {已知红门: 原因})。"""
    path = root / WORKFLOW_CONF
    gates: list[tuple[str, str]] = []
    known_red: dict[str, str] = {}
    if not path.is_file():
        return gates, known_red
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        parts = raw.strip().split(None, 2)
        if not parts or parts[0] not in {"gate", "gate-known-red"}:
            continue
        where = f"{WORKFLOW_CONF}:{number}"
        if len(parts) < 3 or not GATE_NAME_PATTERN.fullmatch(parts[1]):
            raise ConfigError(f"{where}: 写成「{parts[0]} <名字> <{'命令' if parts[0] == 'gate' else '日期与原因'}>」，名字只用字母、数字、_ . -")
        if parts[0] == "gate":
            if any(name == parts[1] for name, _ in gates):
                raise ConfigError(f"{where}: 门 {parts[1]} 登记了两次")
            gates.append((parts[1], parts[2].strip()))
        else:
            known_red[parts[1]] = parts[2].strip()
    unknown = sorted(set(known_red) - {name for name, _ in gates})
    if unknown:
        raise ConfigError(f"{WORKFLOW_CONF}: gate-known-red 指向没登记的门：{' '.join(unknown)}")
    return gates, known_red


def is_code_path(path: str) -> bool:
    return not (path.startswith("docs/") or path.endswith(".md") or path == WORKFLOW_CONF)


def code_fingerprint(root: Path) -> tuple[str, str] | None:
    """(代码指纹, HEAD 短号)；不是仓库或求不出文件内容号时返回 None。

    只看工作区里代码文件的内容，不看提交没提交：`hash-object` 按 `.gitattributes` 的换行规则求号，
    和 `git add` 存进去的一致，所以原样提交前后指纹相同。
    """
    listing = git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard")
    if listing is None:
        return None
    paths = sorted({path for path in listing.split("\0") if path and is_code_path(path) and (root / path).is_file()})
    blobs = git(root, "hash-object", "--stdin-paths", stdin="".join(f"{path}\n" for path in paths)) if paths else ""
    hashes = (blobs or "").split()
    if len(hashes) != len(paths):
        return None
    lines = "\n".join(f"{path}\0{blob}" for path, blob in zip(paths, hashes))
    head = git(root, "rev-parse", "--short", "HEAD")
    return hashlib.sha256(lines.encode("utf-8")).hexdigest()[:16], head.strip() if head else "无提交"


def dirty_code_paths(root: Path) -> list[str]:
    """有未提交改动（含未跟踪）的代码路径。"""
    status = git(root, "status", "--porcelain")
    paths: list[str] = []
    for line in (status or "").splitlines():
        for part in line[3:].split(" -> "):
            path = part.strip().strip('"')
            if path and is_code_path(path):
                paths.append(path)
    return paths


def record_dir(root: Path) -> Path | None:
    git_dir = git(root, "rev-parse", "--git-dir")
    return (root / git_dir.strip() / "workflow").resolve() if git_dir else None


def append_history(root: Path, entry: dict) -> None:
    """每跑一个门追加一行到 `history.jsonl`，不覆盖、不清理，供事后复盘（`gate.json` 只留最近的指纹）。

    写在各工作树共用的 git 目录里，带上工作树名：并行组收组删工作树时，历史不跟着删。
    `gate.json` 仍按工作树分开存，因为新工作树里没有 `.env*`，同样的代码跑出的结果可能不同。
    """
    common = git(root, "rev-parse", "--git-common-dir")
    if not common:
        return
    directory = (root / common.strip() / "workflow").resolve()
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / HISTORY_FILE).open("a", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps({"worktree": root.name, **entry}, ensure_ascii=False) + "\n")


def unfinished_tasks(root: Path) -> list[tuple[str, list[str]]]:
    """`in_progress` 单元里、最后一行（最终代码审查）之前还没 `done` 的任务：[(单元目录名, [任务号])]。

    只看 `in_progress`：接力线、并行组里排在后面的单元是 `approved`，任务还没开始，不算。
    """
    work_root = root / "docs/work"
    found: list[tuple[str, list[str]]] = []
    if not work_root.is_dir():
        return found
    for plan in sorted(work_root.glob("*/plan.md")):
        if plan.parent.name == "_template":
            continue
        text = plan.read_text(encoding="utf-8", errors="replace")
        if not IN_PROGRESS_PLAN_PATTERN.search(text):
            continue
        rows = TASK_STATUS_PATTERN.findall(text)
        pending = [task for task, status in rows[:-1] if status != "done"]
        if pending:
            found.append((plan.parent.name, pending))
    return found


def load_records(directory: Path) -> dict:
    path = directory / "gate.json"
    if not path.is_file():
        return {"order": [], "runs": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"order": [], "runs": {}}
    if not isinstance(data, dict) or not isinstance(data.get("runs"), dict) or not isinstance(data.get("order"), list):
        return {"order": [], "runs": {}}
    return data


def save_records(directory: Path, data: dict) -> None:
    for fingerprint in data["order"][:-MAX_FINGERPRINTS]:
        data["runs"].pop(fingerprint, None)
    data["order"] = data["order"][-MAX_FINGERPRINTS:]
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "gate.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")


def tail_of(log: Path) -> list[str]:
    raw = log.read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode(locale.getpreferredencoding(False), errors="replace")
    return text.splitlines()[-TAIL_LINES:]


def display(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def gate_state(record: dict | None, command: str) -> str:
    """一条记录对归档门算什么：passed / failed / stale（命令改过）/ missing。"""
    if not record:
        return "missing"
    if record.get("command") != command:
        return "stale"
    return "passed" if record.get("status") == "passed" else "failed"


def archive_gate_problems(root: Path) -> list[str]:
    """归档门用：当前代码上还缺什么。没登记门就不查，返回空。"""
    try:
        gates, known_red = read_gates(root)
    except ConfigError as exc:
        return [str(exc)]
    if not gates:
        return []
    fingerprint = code_fingerprint(root)
    directory = record_dir(root)
    if fingerprint is None or directory is None:
        return ["读不到 git 仓库里的代码文件，无法核对机器门记录"]
    runs = load_records(directory)["runs"].get(fingerprint[0], {})
    problems: list[str] = []
    reasons = {
        "missing": "在当前代码上没跑过",
        "stale": "的命令改过，要重跑",
        "failed": "没通过",
    }
    for name, command in gates:
        state = gate_state(runs.get(name), command)
        if state == "passed" or (state == "failed" and name in known_red):
            continue
        problems.append(f"机器门 {name} {reasons[state]}")
    if problems:
        problems.append("在当前代码上跑 python scripts/gate.py；红门要修，或由用户登记 gate-known-red")
    return problems


def run_gates(root: Path, names: list[str]) -> int:
    gates, known_red = read_gates(root)
    if not gates:
        print(f"没有登记机器门：在 {WORKFLOW_CONF} 加「gate <名字> <命令>」行（命令由用户或单元的 AC 定）")
        return 1
    registered = {name for name, _ in gates}
    unknown = [name for name in names if name not in registered]
    if unknown:
        print(f"没有这个门：{' '.join(unknown)}；登记的有：{' '.join(name for name, _ in gates)}")
        return 2
    fingerprint = code_fingerprint(root)
    directory = record_dir(root)
    if fingerprint is None or directory is None:
        print("机器门要在 git 仓库里跑")
        return 2
    dirty = dirty_code_paths(root)
    selected = [(name, command) for name, command in gates if not names or name in names]
    if not names:
        for unit, tasks in unfinished_tasks(root):
            print(
                f"提示：{unit} 还有未完成的任务 {'、'.join(tasks)}；任务级只跑受影响的门（AGENTS.md 第 7 节），"
                "全量留到最终代码审查前。照样跑。"
            )
    directory.mkdir(parents=True, exist_ok=True)
    data = load_records(directory)
    runs = data["runs"].setdefault(fingerprint[0], {})
    if fingerprint[0] in data["order"]:
        data["order"].remove(fingerprint[0])
    data["order"].append(fingerprint[0])

    blocking = 0
    for name, command in selected:
        log = directory / f"{name}.log"
        started = time.monotonic()
        with log.open("wb") as stream:
            result = subprocess.run(
                command, shell=True, cwd=root, stdout=stream, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, check=False
            )
        seconds = round(time.monotonic() - started, 1)
        passed = result.returncode == 0
        runs[name] = {
            "status": "passed" if passed else "failed",
            "exit": result.returncode,
            "command": command,
            "seconds": seconds,
            "head": fingerprint[1],
            "dirty": bool(dirty),
            "at": _dt.datetime.now().isoformat(timespec="seconds"),
        }
        save_records(directory, data)
        append_history(root, {"gate": name, "full": not names, "fingerprint": fingerprint[0], **runs[name]})
        if passed:
            print(f"[gate] {name}  passed  {seconds}s  `{command}`")
            continue
        note = f"（已知红门：{known_red[name]}）" if name in known_red else ""
        print(f"[gate] {name}  failed（退出码 {result.returncode}）{note}  {seconds}s  `{command}`")
        print(f"  日志 {display(log, root)}，末尾 {TAIL_LINES} 行：")
        for line in tail_of(log):
            print(f"  | {line}")
        if name not in known_red:
            blocking += 1

    ran = f"{len(gates)} 个全跑了" if len(selected) == len(gates) else f"跑了 {len(selected)}/{len(gates)} 个"
    print(f"机器门：{ran}，{blocking} 个未过；HEAD {fingerprint[1]}，代码指纹 {fingerprint[0]}")
    if dirty:
        print(f"代码有 {len(dirty)} 处未提交（如 {dirty[0]}）：结果按当前内容记，原样提交后照样算；提交前再改就要重跑。")
    return 1 if blocking else 0


def print_status(root: Path) -> int:
    gates, known_red = read_gates(root)
    if not gates:
        print("没有登记机器门")
        return 0
    fingerprint = code_fingerprint(root)
    directory = record_dir(root)
    if fingerprint is None or directory is None:
        print("读不到 git 仓库里的代码文件")
        return 2
    runs = load_records(directory)["runs"].get(fingerprint[0], {})
    for name, command in gates:
        state = gate_state(runs.get(name), command)
        note = f"（已知红门：{known_red[name]}）" if name in known_red else ""
        when = f"  {runs[name].get('at', '')}" if name in runs else ""
        print(f"[gate] {name}  {state}{note}{when}  `{command}`")
    problems = archive_gate_problems(root)
    print("归档门：" + ("可以过" if not problems else f"还过不了（{len(problems) - 1} 个门）"))
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="机器门")
    parser.add_argument("names", nargs="*", help="只跑这几个门；不写跑全部")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1], help="仓库根目录")
    parser.add_argument("--status", action="store_true", help="只看当前代码上的记录，不跑")
    args = parser.parse_args(argv)

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        if args.status:
            return print_status(args.root.resolve())
        return run_gates(args.root.resolve(), args.names)
    except ConfigError as exc:
        print(exc)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
