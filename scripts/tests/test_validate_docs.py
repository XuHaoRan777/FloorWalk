import importlib.util
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path


SCRIPT_PATH = Path(__file__).parents[1] / "validate_docs.py"


def load_validator():
    spec = importlib.util.spec_from_file_location("validate_docs", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def write_file(root: Path, relative_path: str, content: str = "# Document\n") -> None:
    path = root / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


KERNEL = "# 内核\n\n见 [索引](docs/index.md)。\n"
CONF = "# 注释\nkernel-max-chars 6500\nhardline db/migrations/*\n"


def create_valid_root(root: Path) -> None:
    write_file(root, "AGENTS.md", KERNEL)
    write_file(root, "CLAUDE.md", "@AGENTS.md\n")
    write_file(root, "scripts/workflow.conf", CONF)
    write_file(root, "docs/index.md", "# 索引\n\n[backlog](backlog.md)\n")
    write_file(root, "docs/backlog.md", "# Backlog\n\n## 当前工作\n\n当前无活动工作单元。\n")


def create_work_unit(
    root: Path,
    unit_name: str = "EX-001-example",
    *,
    spec_status: str = "approved",
    work_status: str = "in_progress",
    archive_status: str = "active",
) -> None:
    stable_id = unit_name[:7]
    write_file(
        root,
        f"docs/work/{unit_name}/spec.md",
        f"# Example\n\n> ID：`{stable_id}`\n>\n> 状态：`{spec_status}`\n",
    )
    write_file(
        root,
        f"docs/work/{unit_name}/plan.md",
        "# Plan\n\n## 当前状态\n\n"
        f"- 工作单元状态：`{work_status}`\n- 归档状态：`{archive_status}`\n",
    )


def register_backlog(root: Path, rows: list[tuple[str, str, str]]) -> None:
    lines = ["# Backlog", "", "## 当前工作", "", "| ID | 工作单元 | 状态 | 依赖 | 下一步 |", "| --- | --- | --- | --- | --- |"]
    for stable_id, unit_name, status in rows:
        lines.append(f"| {stable_id} | [x](work/{unit_name}/spec.md) | `{status}` | - | - |")
    write_file(root, "docs/backlog.md", "\n".join(lines) + "\n")


class ValidateDocsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.validator = load_validator()
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        create_valid_root(self.root)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def codes(self, **kwargs) -> list[str]:
        return sorted(issue.code for issue in self.validator.validate_repository(self.root, **kwargs))

    def test_valid_root_passes(self) -> None:
        self.assertEqual(self.codes(), [])

    def test_backlog_accepts_legacy_readme_link(self) -> None:
        create_work_unit(self.root)
        write_file(self.root, "docs/work/EX-001-example/README.md", "# EX-001\n")
        register_backlog(self.root, [("EX-001", "EX-001-example", "in_progress")])
        content = (self.root / "docs/backlog.md").read_text(encoding="utf-8").replace("/spec.md)", "/README.md)")
        write_file(self.root, "docs/backlog.md", content)
        self.assertEqual(self.codes(), [])

    # 1. 敏感信息
    def test_plaintext_secret_is_reported(self) -> None:
        write_file(self.root, "docs/notes.md", "JWT_SECRET=abc123\n")
        self.assertIn("sensitive-value", self.codes())

    def test_placeholder_secret_is_allowed(self) -> None:
        write_file(self.root, "docs/notes.md", "JWT_SECRET=<your-secret>\nDB_PASSWORD=${DB_PASSWORD}\n")
        self.assertEqual(self.codes(), [])

    def test_private_key_is_reported(self) -> None:
        write_file(self.root, "docs/notes.md", "-----BEGIN RSA PRIVATE KEY-----\n")
        self.assertIn("private-key", self.codes())

    # 2. 链接
    def test_broken_docs_link_is_reported(self) -> None:
        write_file(self.root, "docs/notes.md", "[x](missing.md)\n")
        self.assertIn("broken-link", self.codes())

    def test_link_to_code_is_not_checked(self) -> None:
        write_file(self.root, "docs/notes.md", "[x](../apps/api/deleted.ts)\n")
        self.assertEqual(self.codes(), [])

    def test_links_in_fenced_code_are_ignored(self) -> None:
        write_file(self.root, "docs/notes.md", "```md\n[x](missing.md)\n```\n")
        self.assertEqual(self.codes(), [])

    def test_external_and_fragment_links_are_allowed(self) -> None:
        write_file(self.root, "docs/notes.md", "[a](https://example.com) [b](index.md#anything)\n")
        self.assertEqual(self.codes(), [])

    # 3. 工作单元状态
    def test_valid_active_unit_registered_in_backlog_passes(self) -> None:
        create_work_unit(self.root)
        register_backlog(self.root, [("EX-001", "EX-001-example", "in_progress")])
        self.assertEqual(self.codes(), [])

    def test_missing_plan_is_reported(self) -> None:
        create_work_unit(self.root)
        (self.root / "docs/work/EX-001-example/plan.md").unlink()
        register_backlog(self.root, [])
        self.assertIn("unit-file", self.codes())

    def test_invalid_statuses_are_reported(self) -> None:
        create_work_unit(self.root, spec_status="in_progress", work_status="done", archive_status="closed")
        codes = self.codes()
        for code in ("spec-status", "work-status", "archive-status"):
            self.assertIn(code, codes)

    def test_archived_requires_terminal_status(self) -> None:
        create_work_unit(self.root, work_status="in_progress", archive_status="archived")
        self.assertIn("archive-status", self.codes())

    def test_archived_descoped_passes(self) -> None:
        create_work_unit(self.root, work_status="descoped", archive_status="archived")
        self.assertEqual(self.codes(), [])

    def test_bad_directory_name_is_reported(self) -> None:
        create_work_unit(self.root, "EX-1-Bad_Name")
        self.assertIn("unit-id", self.codes())

    # 4. Backlog 一致性与活动单元上限
    def test_unlisted_active_unit_is_reported(self) -> None:
        create_work_unit(self.root)
        self.assertIn("backlog", self.codes())

    def test_listed_archived_unit_is_reported(self) -> None:
        create_work_unit(self.root, work_status="verified", archive_status="archived")
        register_backlog(self.root, [("EX-001", "EX-001-example", "verified")])
        self.assertIn("backlog", self.codes())

    def test_status_mismatch_is_reported(self) -> None:
        create_work_unit(self.root, work_status="blocked")
        register_backlog(self.root, [("EX-001", "EX-001-example", "in_progress")])
        self.assertIn("backlog", self.codes())

    def test_too_many_active_units_is_reported(self) -> None:
        names = [f"EX-00{i}-unit{i}" for i in range(1, 5)]
        for name in names:
            create_work_unit(self.root, name)
        register_backlog(self.root, [(n[:6], n, "in_progress") for n in names])
        self.assertIn("active-units", self.codes())

    def test_three_active_units_pass(self) -> None:
        names = [f"EX-00{i}-unit{i}" for i in range(1, 4)]
        for name in names:
            create_work_unit(self.root, name)
        register_backlog(self.root, [(n[:6], n, "in_progress") for n in names])
        self.assertEqual(self.codes(), [])

    def test_active_units_max_from_conf_raises_limit(self) -> None:
        write_file(self.root, "scripts/workflow.conf", CONF + "active-units-max 4\n")
        names = [f"EX-00{i}-unit{i}" for i in range(1, 5)]
        for name in names:
            create_work_unit(self.root, name)
        register_backlog(self.root, [(n[:6], n, "in_progress") for n in names])
        self.assertEqual(self.codes(), [])

    def test_active_units_max_from_conf_still_caps(self) -> None:
        write_file(self.root, "scripts/workflow.conf", CONF + "active-units-max 4\n")
        names = [f"EX-00{i}-unit{i}" for i in range(1, 6)]
        for name in names:
            create_work_unit(self.root, name)
        register_backlog(self.root, [(n[:6], n, "in_progress") for n in names])
        self.assertIn("active-units", self.codes())

    # 5. 当前事实不指向工作单元
    def test_spec_linking_to_work_unit_is_reported(self) -> None:
        create_work_unit(self.root, work_status="verified", archive_status="archived")
        write_file(self.root, "docs/specs/orders.md", "[设计](../work/EX-001-example/spec.md)\n")
        self.assertIn("work-link", self.codes())

    def test_backlog_and_unit_may_link_to_work(self) -> None:
        create_work_unit(self.root)
        register_backlog(self.root, [("EX-001", "EX-001-example", "in_progress")])
        write_file(self.root, "docs/work/EX-001-example/plan.md",
                   "# Plan\n\n## 当前状态\n\n- 工作单元状态：`in_progress`\n- 归档状态：`active`\n\n[spec](./spec.md)\n")
        self.assertEqual(self.codes(), [])

    # 6. 修正记录预算
    def _testlog(self, rows: list[tuple[str, str]]) -> None:
        lines = ["# 修正记录", "", "| 日期 | 场景 | 改动 | 验证 | specs | 审查 |", "| --- | --- | --- | --- | --- | --- |"]
        for date, specs in rows:
            lines.append(f"| {date} | s | c | v | {specs} | 无 |")
        write_file(self.root, "docs/testlog.md", "\n".join(lines) + "\n")

    def test_testlog_within_budget_passes(self) -> None:
        self._testlog([("2026-10-02", "待同步 specs/orders.md「接单」")] * 5 + [("2026-10-01", "无")] * 3)
        self.assertEqual(self.codes(today=date(2026, 10, 3)), [])

    def test_testlog_too_many_pending_is_reported(self) -> None:
        self._testlog([("2026-10-02", "待同步 x")] * 6)
        self.assertIn("testlog-debt", self.codes(today=date(2026, 10, 2)))

    def test_testlog_many_plain_rows_do_not_count_toward_cap(self) -> None:
        self._testlog([("2026-10-02", "无")] * 12)
        self.assertEqual(self.codes(today=date(2026, 10, 2)), [])

    def test_testlog_stale_buffer_is_reported_even_without_pending(self) -> None:
        self._testlog([("2026-10-01", "无")])
        self.assertIn("testlog-debt", self.codes(today=date(2026, 10, 4)))

    def test_empty_testlog_passes(self) -> None:
        self._testlog([])
        self.assertEqual(self.codes(today=date(2026, 10, 4)), [])

    # 7. 内核字数
    def _kernel_limit(self, limit: str) -> None:
        write_file(self.root, "scripts/workflow.conf", f"hardline db/*\nkernel-max-chars {limit}  # 只降不升\n")

    def test_kernel_over_limit_is_reported(self) -> None:
        self._kernel_limit(str(len(KERNEL) - 1))
        self.assertEqual(self.codes(), ["kernel-size"])

    def test_kernel_at_limit_passes(self) -> None:
        self._kernel_limit(str(len(KERNEL)))
        self.assertEqual(self.codes(), [])

    def test_kernel_size_counts_characters_not_bytes(self) -> None:
        write_file(self.root, "AGENTS.md", "内" * 30)
        self._kernel_limit("40")
        self.assertEqual(self.codes(), [])

    def test_kernel_size_ignores_line_ending_style(self) -> None:
        (self.root / "AGENTS.md").write_bytes(KERNEL.replace("\n", "\r\n").encode("utf-8"))
        self._kernel_limit(str(len(KERNEL)))
        self.assertEqual(self.codes(), [])

    def test_missing_conf_is_reported(self) -> None:
        (self.root / "scripts/workflow.conf").unlink()
        self.assertEqual(self.codes(), ["kernel-size"])

    def test_non_integer_limit_is_reported(self) -> None:
        self._kernel_limit("6.5k")
        self.assertEqual(self.codes(), ["kernel-size"])

    # 8. 归档门
    def test_archive_gate_requires_clean_worktree(self) -> None:
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        self.assertIn("archive-gate", self.codes(archive_gate=True))
        subprocess.run(["git", "add", "-A"], cwd=self.root, check=True)
        subprocess.run(
            ["git", "-c", "user.email=t@t", "-c", "user.name=test", "commit", "-qm", "init"],
            cwd=self.root,
            check=True,
        )
        self.assertEqual(self.codes(archive_gate=True), [])

    # 14. 回修表
    REWORK_HEADER = "| 日期 | 用户原话 | 状态 | 改动或去向 | 提交 |\n| --- | --- | --- | --- | --- |\n"

    def rework_unit(self, rows: str, *, archive_status: str = "active", queue: str = "") -> None:
        work_status = "verified" if archive_status == "archived" else "in_progress"
        create_work_unit(self.root, work_status=work_status, archive_status=archive_status)
        plan = self.root / "docs/work/EX-001-example/plan.md"
        plan.write_text(plan.read_text(encoding="utf-8") + "\n## 回修\n\n" + self.REWORK_HEADER + rows, encoding="utf-8")
        register_backlog(self.root, [("EX-001", "EX-001-example", work_status)] if archive_status == "active" else [])
        backlog = self.root / "docs/backlog.md"
        queue_table = "| 顺序 | 目标 | 前置 | 类型 |\n| --- | --- | --- | --- |\n" + queue
        backlog.write_text(backlog.read_text(encoding="utf-8") + "\n## 待开单元（未批准）\n\n" + queue_table, encoding="utf-8")

    def test_rework_done_rows_pass(self) -> None:
        self.rework_unit("| 2026-11-20 | \"高亮第 400 字后的命中\" | `做了` | 摘要按命中截取 | `abc1234` |\n")
        self.assertEqual(self.codes(), [])

    def test_rework_old_format_is_not_checked(self) -> None:
        create_work_unit(self.root)
        plan = self.root / "docs/work/EX-001-example/plan.md"
        old = "\n## 回修\n\n| 日期 | 反馈 | 改动 | 提交 |\n| --- | --- | --- | --- |\n| 2026-10-20 | 换图 | 改了 | `abc` |\n"
        plan.write_text(plan.read_text(encoding="utf-8") + old, encoding="utf-8")
        register_backlog(self.root, [("EX-001", "EX-001-example", "in_progress")])
        self.assertEqual(self.codes(), [])

    def test_rework_unknown_status_is_reported(self) -> None:
        self.rework_unit("| 2026-11-20 | \"来源要显示页码\" | 记录过 | 待修正模式 | 无 |\n")
        self.assertEqual(self.codes(), ["rework"])

    def test_rework_deferred_needs_consent_date_and_queue_row(self) -> None:
        self.rework_unit("| 2026-11-20 | \"来源要显示页码\" | `延后` | 留到修正模式 | 无 |\n")
        self.assertEqual(self.codes(), ["rework", "rework"])

    def test_rework_deferred_with_queue_row_passes(self) -> None:
        self.rework_unit(
            "| 2026-11-20 | \"来源要显示页码\" | `延后` | 用户 2026-11-20 同意，已登记 | 无 |\n",
            queue="| 1 | \"来源要显示页码\"（EX-001 回修） | 无 | 修正 |\n",
        )
        self.assertEqual(self.codes(), [])

    def test_rework_each_deferral_needs_its_own_queue_row(self) -> None:
        deferred = "| 2026-11-20 | \"{}\" | `延后` | 用户 2026-11-20 同意 | 无 |\n"
        self.rework_unit(
            deferred.format("页码") + deferred.format("高亮"), queue="| 1 | \"页码\"（EX-001 回修） | 无 | 修正 |\n"
        )
        self.assertEqual(self.codes(), ["rework"])

    def test_rework_deferred_into_another_unit_passes(self) -> None:
        self.rework_unit("| 2026-11-20 | \"来源要显示页码\" | `延后` | 用户 2026-11-20 同意，转 EX-002 | 无 |\n")
        self.assertEqual(self.codes(), [])

    def test_rework_queue_check_skips_committed_archived_units(self) -> None:
        self.rework_unit("| 2026-11-20 | \"来源要显示页码\" | `延后` | 用户 2026-11-20 同意 | 无 |\n", archive_status="archived")
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        subprocess.run(["git", "add", "-A"], cwd=self.root, check=True)
        subprocess.run(
            ["git", "-c", "user.email=t@t", "-c", "user.name=test", "commit", "-qm", "init"], cwd=self.root, check=True
        )
        self.assertEqual(self.codes(), [])
        plan = self.root / "docs/work/EX-001-example/plan.md"
        plan.write_text(plan.read_text(encoding="utf-8") + "\n", encoding="utf-8")
        self.assertEqual(self.codes(), ["rework"])  # 归档改动没提交：还在归档这一步

    # 12. 钩子装没装
    def test_uninstalled_hooks_are_reported_at_repo_root(self) -> None:
        write_file(self.root, "scripts/hooks/commit-msg", "#!/bin/sh\n")
        self.assertEqual(self.codes(), [], "不是仓库根时不查")
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        self.assertEqual(self.codes(), ["hooks"])
        subprocess.run(["git", "config", "core.hooksPath", "scripts/hooks"], cwd=self.root, check=True)
        self.assertEqual(self.codes(), [])

    def test_cli_exit_codes(self) -> None:
        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH), "--root", str(self.root)],
            capture_output=True, text=True, encoding="utf-8", check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        write_file(self.root, "docs/notes.md", "[x](missing.md)\n")
        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH), "--root", str(self.root)],
            capture_output=True, text=True, encoding="utf-8", check=False,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("broken-link", result.stdout)


PROBE = "- 接力探针（2026-11-12）：提交、执行器、本地配置通过\n"


def create_ready_unit(
    root: Path,
    unit_name: str = "EX-001-example",
    *,
    mode: str = "B Agent 验收",
    spec_status: str = "approved",
    work_status: str = "approved",
    criteria: str = "- AC-01（`用户要求`）：做到这件事。\n- AC-02（`建议采纳`）：失败时有提示。\n",
    approval_extra: str = "",
    plan_extra: str = "",
    tasks: int = 2,
) -> None:
    stable_id = unit_name[:6]
    write_file(
        root,
        f"docs/work/{unit_name}/spec.md",
        f"# 示例\n\n> ID：`{stable_id}`\n>\n> 状态：`{spec_status}`\n\n## 目标\n\n能做一件事。\n\n"
        f"## 验收标准\n\n<!-- 模板注释里的 AC-01 不算 -->\n\n{criteria}\n"
        f"## 验收方式\n\n`{mode}`\n\n<!-- 注释里同时出现 A 人工验收 和 B Agent 验收 不算 -->\n\n"
        "## 批准记录\n\n- 批准依据：用户说“可以，批准”\n- 批准时间：`2026-11-12`\n- 特殊授权：无\n" + approval_extra,
    )
    rows = "".join(f"| T{number:02d} | 任务 {number} | `pending` | AC-01 |\n" for number in range(1, tasks + 1))
    write_file(
        root,
        f"docs/work/{unit_name}/plan.md",
        "# 示例 - 执行计划\n\n## 当前状态\n\n"
        f"- 工作单元状态：`{work_status}`\n- 归档状态：`active`\n{plan_extra}\n"
        "## 任务表\n\n| ID | 任务 | 状态 | 交付的 AC 与证据 |\n| --- | --- | --- | --- |\n" + rows,
    )


def commit_all(root: Path) -> None:
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True)
    subprocess.run(
        ["git", "-c", "user.email=t@t", "-c", "user.name=test", "commit", "-qm", "init"], cwd=root, check=True
    )


class KickoffTests(unittest.TestCase):
    """12. 开工提示词：单元没准备好就不输出。"""

    def setUp(self) -> None:
        self.validator = load_validator()
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        create_valid_root(self.root)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def single(self, **kwargs) -> list[str]:
        create_ready_unit(self.root, **kwargs)
        status = kwargs.get("work_status", "approved")
        register_backlog(self.root, [("EX-001", "EX-001-example", status)])
        return self.messages(["EX-001"])

    def messages(self, unit_ids: list[str]) -> list[str]:
        issues: list = []
        self.validator.check_kickoff(self.root, unit_ids, issues)
        self.assertTrue(all(issue.code == "kickoff" for issue in issues))
        return [issue.message for issue in issues]

    def relay(self, modes: list[str], *, probe: str = PROBE) -> list[str]:
        names = [f"EX-00{number}-step" for number in range(1, len(modes) + 1)]
        for name, mode in zip(names, modes):
            create_ready_unit(self.root, name, mode=mode, approval_extra=probe)
        register_backlog(self.root, [(name[:6], name, "approved") for name in names])
        return [name[:6] for name in names]

    def run_cli(self, *unit_ids: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(SCRIPT_PATH), "--root", str(self.root), "--kickoff", *unit_ids],
            capture_output=True, text=True, encoding="utf-8", check=False,
        )

    def test_ready_unit_prints_one_line_prompt(self) -> None:
        self.assertEqual(self.single(), [])
        result = self.run_cli("EX-001")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(result.stdout.strip().splitlines()[-1], "执行 EX-001。")

    def test_in_progress_unit_can_be_resumed(self) -> None:
        self.assertEqual(self.single(work_status="in_progress", tasks=11), [])

    def test_draft_spec_is_refused_and_no_prompt_is_printed(self) -> None:
        messages = self.single(spec_status="draft", work_status="draft")
        self.assertTrue(any("还没批准" in message for message in messages), messages)
        result = self.run_cli("EX-001")
        self.assertEqual(result.returncode, 1)
        self.assertNotIn("执行 EX-001", result.stdout)

    def test_ac_without_label_or_text_is_refused(self) -> None:
        messages = self.single(criteria="- AC-01：没有标签。\n- AC-02（`用户要求`）：\n")
        self.assertEqual(sum("AC 缺标签或没写内容" in message for message in messages), 2, messages)

    def test_project_specific_label_is_accepted(self) -> None:
        self.assertEqual(self.single(criteria="- AC-01（`AI 定`）：迁移可以重复执行。\n"), [])

    def test_missing_criteria_is_refused(self) -> None:
        self.assertTrue(any("一条 AC 都没有" in message for message in self.single(criteria="")))

    def test_undecided_acceptance_mode_is_refused(self) -> None:
        messages = self.single(mode="A 人工验收` | `B Agent 验收")
        self.assertTrue(any("验收方式没定" in message for message in messages), messages)

    def test_too_many_tasks_at_approval_is_refused(self) -> None:
        self.assertTrue(any("拆单元" in message for message in self.single(tasks=9)))

    def test_parallel_group_unit_is_refused(self) -> None:
        messages = self.single(plan_extra="- 并行组：g01，线 L1 第 1 个，槽位 1\n")
        self.assertTrue(any("parallel.md" in message for message in messages), messages)

    def test_unfilled_template_is_refused(self) -> None:
        template = SCRIPT_PATH.parents[1] / "docs/work/_template/spec.md"
        content = template.read_text(encoding="utf-8")
        body = self.validator.HTML_COMMENT_PATTERN.sub("", content)
        for token in self.validator.SPEC_TEMPLATE_LEFTOVERS:
            self.assertIn(token, body, "模板改了字样，SPEC_TEMPLATE_LEFTOVERS 要跟着改")
        create_ready_unit(self.root)
        write_file(self.root, "docs/work/EX-001-example/spec.md", content.replace("`draft`", "`approved`"))
        register_backlog(self.root, [("EX-001", "EX-001-example", "approved")])
        messages = self.messages(["EX-001"])
        for expected in ("ID 应为 EX-001", "还留着模板字样", "AC 缺标签或没写内容", "验收方式没定"):
            self.assertTrue(any(expected in message for message in messages), (expected, messages))

    def test_empty_approval_record_is_refused(self) -> None:
        create_ready_unit(self.root)
        spec = self.root / "docs/work/EX-001-example/spec.md"
        for old, new in (("批准依据：用户说“可以，批准”", "批准依据："), ("批准时间：`2026-11-12`", "批准时间：")):
            content = spec.read_text(encoding="utf-8")
            spec.write_text(content.replace(old, new), encoding="utf-8")
            self.assertTrue(any("缺批准依据" in message for message in self.messages(["EX-001"])), old)
            spec.write_text(content, encoding="utf-8")

    def test_unknown_or_malformed_unit_is_refused(self) -> None:
        self.assertTrue(any("找不到单元" in message for message in self.messages(["EX-009"])))
        self.assertTrue(any("写错或重复" in message for message in self.messages(["ex-1"])))
        self.assertTrue(any("写错或重复" in message for message in self.messages(["EX-001", "EX-001"])))

    def test_validation_issue_blocks_prompt(self) -> None:
        self.assertEqual(self.single(), [])
        write_file(self.root, "docs/notes.md", "[x](missing.md)\n")
        result = self.run_cli("EX-001")
        self.assertEqual(result.returncode, 1)
        self.assertIn("broken-link", result.stdout)
        self.assertNotIn("执行 EX-001", result.stdout)

    def test_relay_line_prints_first_and_last(self) -> None:
        unit_ids = self.relay(["B Agent 验收", "B Agent 验收", "A 人工验收"])
        commit_all(self.root)
        self.assertEqual(self.messages(unit_ids), [])
        result = self.run_cli(*unit_ids)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(
            result.stdout.strip().splitlines()[-1], "执行 EX-001，自动接力到 EX-003，按 docs/howto/relay.md。"
        )

    def test_relay_requires_clean_worktree(self) -> None:
        unit_ids = self.relay(["B Agent 验收", "B Agent 验收"])
        commit_all(self.root)
        self.assertEqual(self.messages(unit_ids), [])
        write_file(self.root, "docs/notes.md", "# 未提交\n")
        self.assertTrue(any("工作树干净" in message for message in self.messages(unit_ids)))

    def test_relay_with_manual_unit_before_tail_is_refused(self) -> None:
        unit_ids = self.relay(["B Agent 验收", "A 人工验收", "B Agent 验收"])
        commit_all(self.root)
        self.assertEqual(self.messages(unit_ids), ["方式 A 的单元只能在线尾，一条线最多一个"])

    def test_two_unit_relay_ending_in_manual_is_below_threshold(self) -> None:
        unit_ids = self.relay(["B Agent 验收", "A 人工验收"])
        commit_all(self.root)
        messages = self.messages(unit_ids)
        self.assertEqual(len(messages), 1, messages)
        self.assertIn("不够接力门槛", messages[0])

    def test_relay_without_probe_record_is_refused(self) -> None:
        unit_ids = self.relay(["B Agent 验收", "B Agent 验收"], probe="")
        commit_all(self.root)
        messages = self.messages(unit_ids)
        self.assertEqual(sum("接力探针" in message for message in messages), 2, messages)


if __name__ == "__main__":
    unittest.main()
