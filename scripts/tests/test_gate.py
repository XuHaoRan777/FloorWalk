import contextlib
import importlib.util
import io
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).parents[1]
GIT = ["git", "-c", "user.email=t@t", "-c", "user.name=test", "-c", "commit.gpgsign=false"]
PYTHON = f'"{sys.executable}"' if " " in sys.executable else sys.executable


def load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class GateTests(unittest.TestCase):
    """机器门：结果由脚本记录，归档门只认当前代码上的全绿记录。"""

    @classmethod
    def setUpClass(cls) -> None:
        if shutil.which("git") is None:
            raise unittest.SkipTest("需要 git")
        cls.gate = load("gate")

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.git("init", "-q")
        self.write("ok.py", "print('fine')\n")
        self.write("bad.py", "import sys\nprint('line-before')\nprint('boom-marker')\nsys.exit(3)\n")
        self.write("src/app.py", "x = 1\n")
        self.write("docs/notes.md", "# 说明\n")
        self.conf(f"gate unit {PYTHON} ok.py")
        self.commit("init")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def git(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run([*GIT, *args], cwd=self.root, capture_output=True, text=True, encoding="utf-8", check=False)

    def write(self, relative_path: str, content: str) -> None:
        path = self.root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def conf(self, *lines: str) -> None:
        self.write("scripts/workflow.conf", "kernel-max-chars 8500\n# gate off echo 注释掉的不算\n" + "\n".join(lines) + "\n")

    def commit(self, message: str) -> None:
        self.git("add", "-A")
        result = self.git("commit", "-q", "--no-verify", "-m", message)
        self.assertEqual(result.returncode, 0, result.stderr)

    def run_gate(self, *names: str) -> tuple[int, str]:
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            try:
                code = self.gate.run_gates(self.root, list(names))
            except self.gate.ConfigError as exc:
                return 2, str(exc)
        return code, buffer.getvalue()

    def problems(self) -> list[str]:
        return self.gate.archive_gate_problems(self.root)

    def test_no_registered_gate_is_not_checked(self) -> None:
        self.conf()
        self.commit("去掉门")
        self.assertEqual(self.problems(), [])
        code, output = self.run_gate()
        self.assertEqual(code, 1)
        self.assertIn("没有登记机器门", output)

    def test_gate_never_run_blocks_archive(self) -> None:
        problems = self.problems()
        self.assertIn("机器门 unit 在当前代码上没跑过", problems)

    def test_passing_run_is_recorded_and_leaves_worktree_clean(self) -> None:
        code, output = self.run_gate()
        self.assertEqual(code, 0, output)
        self.assertIn("[gate] unit  passed", output)
        self.assertEqual(self.problems(), [])
        self.assertEqual(self.git("status", "--short").stdout, "")

    def test_docs_only_commit_keeps_record_valid(self) -> None:
        self.assertEqual(self.run_gate()[0], 0)
        self.write("docs/notes.md", "# 说明\n\n归档。\n")
        self.write("README.md", "# 项目\n")
        self.commit("docs: 归档")
        self.assertEqual(self.problems(), [])

    def test_code_commit_invalidates_record(self) -> None:
        self.assertEqual(self.run_gate()[0], 0)
        self.write("src/app.py", "x = 2\n")
        self.commit("feat: 改代码")
        self.assertIn("机器门 unit 在当前代码上没跑过", self.problems())

    def test_run_on_uncommitted_code_counts_once_committed_unchanged(self) -> None:
        self.write("src/app.py", "x = 3\n")
        self.write("src/new.py", "y = 1\n")  # 未跟踪的新文件也算进内容
        code, output = self.run_gate()
        self.assertEqual(code, 0, output)
        self.assertIn("原样提交后照样算", output)
        self.commit("feat: 交接前提交")
        self.assertEqual(self.problems(), [])

    def test_edit_after_uncommitted_run_needs_rerun(self) -> None:
        self.write("src/app.py", "x = 3\n")
        self.assertEqual(self.run_gate()[0], 0)
        self.write("src/app.py", "x = 4\n")
        self.commit("feat: 跑完又改了")
        self.assertIn("机器门 unit 在当前代码上没跑过", self.problems())

    def test_new_file_after_run_needs_rerun(self) -> None:
        self.assertEqual(self.run_gate()[0], 0)
        self.write("src/new.py", "y = 1\n")
        self.commit("feat: 跑完加了文件")
        self.assertIn("机器门 unit 在当前代码上没跑过", self.problems())

    def test_reverting_after_uncommitted_run_needs_rerun(self) -> None:
        self.write("src/app.py", "x = 3\n")
        self.assertEqual(self.run_gate()[0], 0)
        self.git("checkout", "--", "src/app.py")
        self.assertIn("机器门 unit 在当前代码上没跑过", self.problems())

    def test_line_ending_normalization_keeps_record_valid(self) -> None:
        self.write(".gitattributes", "*.py text eol=lf\n")
        self.commit("统一换行")
        (self.root / "src/app.py").write_bytes(b"x = 5\r\n")
        self.assertEqual(self.run_gate()[0], 0)
        self.commit("feat: 工作区是 CRLF，入库是 LF")
        self.assertEqual(self.problems(), [])

    def test_ignored_files_do_not_affect_record(self) -> None:
        self.write(".gitignore", "build/\n")
        self.commit("忽略构建产物")
        self.assertEqual(self.run_gate()[0], 0)
        self.write("build/out.js", "console.log(1)\n")
        self.assertEqual(self.problems(), [])

    def test_failing_gate_prints_tail_and_blocks_archive(self) -> None:
        self.conf(f"gate unit {PYTHON} bad.py")
        self.commit("换成红门")
        code, output = self.run_gate()
        self.assertEqual(code, 1)
        self.assertIn("failed（退出码 3）", output)
        self.assertIn("| boom-marker", output)
        self.assertIn("机器门 unit 没通过", self.problems())

    def test_known_red_gate_still_runs_but_does_not_block(self) -> None:
        self.conf(f"gate unit {PYTHON} ok.py", f"gate legacy {PYTHON} bad.py", "gate-known-red legacy 2026-11-12 Admin 既有 44 个类型错误")
        self.commit("登记已知红门")
        self.assertTrue(any("legacy 在当前代码上没跑过" in problem for problem in self.problems()))
        code, output = self.run_gate()
        self.assertEqual(code, 0, output)
        self.assertIn("已知红门：2026-11-12 Admin 既有 44 个类型错误", output)
        self.assertEqual(self.problems(), [])

    def test_subset_run_leaves_other_gates_missing(self) -> None:
        self.conf(f"gate unit {PYTHON} ok.py", f"gate other {PYTHON} ok.py")
        self.commit("两个门")
        code, output = self.run_gate("unit")
        self.assertEqual(code, 0, output)
        self.assertIn("跑了 1/2 个", output)
        problems = self.problems()
        self.assertFalse(any("unit" in problem for problem in problems))
        self.assertIn("机器门 other 在当前代码上没跑过", problems)

    def test_changed_command_makes_record_stale(self) -> None:
        self.assertEqual(self.run_gate()[0], 0)
        self.conf(f"gate unit {PYTHON} ok.py --strict")
        self.commit("改门的命令")
        self.assertIn("机器门 unit 的命令改过，要重跑", self.problems())

    def test_unknown_gate_name_is_refused(self) -> None:
        code, output = self.run_gate("nope")
        self.assertEqual(code, 2)
        self.assertIn("没有这个门", output)

    def test_malformed_conf_is_reported(self) -> None:
        self.conf("gate unit")
        self.assertEqual(self.run_gate()[0], 2)
        self.assertTrue(self.problems())
        self.conf(f"gate unit {PYTHON} ok.py", "gate-known-red ghost 2026-11-12 没这个门")
        self.assertEqual(self.run_gate()[0], 2)

    def test_archive_gate_of_validator_uses_records(self) -> None:
        validator = load("validate_docs")
        self.write("AGENTS.md", "# 内核\n")
        self.write("docs/backlog.md", "# Backlog\n\n## 当前工作\n")
        self.commit("docs: 内核")
        messages = [issue.message for issue in validator.validate_repository(self.root, archive_gate=True)]
        self.assertTrue(any("机器门 unit 在当前代码上没跑过" in message for message in messages), messages)
        self.assertEqual(self.run_gate()[0], 0)
        self.assertEqual(validator.validate_repository(self.root, archive_gate=True), [])


if __name__ == "__main__":
    unittest.main()
