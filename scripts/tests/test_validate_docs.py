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


def create_valid_root(root: Path) -> None:
    write_file(root, "AGENTS.md", KERNEL)
    write_file(root, "CLAUDE.md", "@AGENTS.md\n")
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

    # 7. 归档门
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


if __name__ == "__main__":
    unittest.main()
