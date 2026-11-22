import os
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


HOOKS_DIR = Path(__file__).parents[1] / "hooks"
HOOK_NAMES = ("commit-msg", "prepare-commit-msg")
CONF = "kernel-max-chars 6500\n# hardline docs/*\nhardline db/migrations/*\n  hardline src/auth/*   # 认证模块\n"
GIT = ["git", "-c", "user.email=t@t", "-c", "user.name=test", "-c", "commit.gpgsign=false"]


class CommitMsgHookTests(unittest.TestCase):
    """在临时仓库里用真实 git commit 触发钩子。"""

    @classmethod
    def setUpClass(cls) -> None:
        # 钩子由 git 自带的 sh 执行，只需要 git 在 PATH 上
        if shutil.which("git") is None:
            raise unittest.SkipTest("需要 git")

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.git("init", "-q")
        hooks = self.root / "scripts" / "hooks"
        hooks.mkdir(parents=True)
        for name in HOOK_NAMES:
            (hooks / name).write_bytes((HOOKS_DIR / name).read_bytes())
            if os.name != "nt":
                (hooks / name).chmod(stat.S_IRWXU)
        self.git("config", "core.hooksPath", "scripts/hooks")
        self.write("scripts/workflow.conf", CONF)
        self.write("docs/testlog.md", "# 修正记录\n")
        self.unit("EX-001-done", "verified", "archived")
        self.unit("EX-002-waiting", "blocked")
        self.git("add", "-A")
        self.git("commit", "-q", "--no-verify", "-m", "init")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def git(self, *args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess:
        return subprocess.run(
            [*GIT, *args],
            cwd=self.root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
            env={**os.environ, **env} if env else None,
        )

    def write(self, relative_path: str, content: str = "x\n") -> None:
        path = self.root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def unit(self, name: str, work_status: str, archive_status: str = "active") -> None:
        self.write(
            f"docs/work/{name}/plan.md",
            f"# 计划\n\n## 当前状态\n\n- 工作单元状态：`{work_status}`\n- 归档状态：`{archive_status}`\n",
        )

    def last_message(self) -> str:
        return self.git("log", "-1", "--format=%B").stdout

    def commit(self, message: str, *paths: str) -> subprocess.CompletedProcess:
        for path in paths:
            self.write(path, f"{path} {message}\n")
        self.git("add", "-A")
        return self.git("commit", "-q", "-m", message)

    def assertAccepted(self, result: subprocess.CompletedProcess) -> None:
        self.assertEqual(result.returncode, 0, result.stderr)

    def assertRejected(self, result: subprocess.CompletedProcess, reason: str) -> None:
        self.assertNotEqual(result.returncode, 0, "钩子应当拒绝")
        self.assertIn("commit-msg:", result.stderr, f"不是钩子拒绝的：{result.stdout}{result.stderr}")
        self.assertIn(reason, result.stderr)

    # 1. 修正模式要追加 testlog
    def test_plain_commit_passes(self) -> None:
        self.assertAccepted(self.commit("feat(EX-001): 新页面", "src/page.ts"))

    def test_fix_on_own_line_without_testlog_is_rejected(self) -> None:
        self.assertRejected(self.commit("fix: 改文案\n\nMode: fix", "src/page.ts"), "testlog")

    def test_fix_at_end_of_subject_is_detected(self) -> None:
        self.assertRejected(self.commit("fix: 改文案 Mode: fix", "src/page.ts"), "testlog")

    def test_literal_backslash_n_before_mode_is_detected(self) -> None:
        self.assertRejected(self.commit("fix: 改文案\\n\\nMode: fix", "src/page.ts"), "testlog")

    def test_fix_with_testlog_passes(self) -> None:
        self.assertAccepted(self.commit("fix: 改文案 Mode: fix", "src/page.ts", "docs/testlog.md"))

    def test_fix_touching_only_docs_passes(self) -> None:
        self.assertAccepted(self.commit("docs: 改说明 Mode: fix", "docs/specs/orders.md"))

    def test_mode_fixed_is_not_fix_mode(self) -> None:
        self.assertAccepted(self.commit("chore(EX-001): Mode: fixed 不是修正模式", "src/page.ts"))

    def test_mode_in_comment_line_is_ignored(self) -> None:
        self.write("msg.txt", "feat(EX-001): 新页面\n# Mode: fix\n")
        self.write("src/page.ts", "y\n")
        self.git("add", "src/page.ts")
        self.assertAccepted(self.git("commit", "-q", "--cleanup=strip", "-F", "msg.txt"))

    # 2. 硬线路径要有「硬线：」行
    def test_hardline_path_without_line_is_rejected(self) -> None:
        result = self.commit("feat(EX-001): 加表", "db/migrations/0001_add.sql")
        self.assertRejected(result, "硬线")
        self.assertIn("db/migrations/0001_add.sql", result.stderr)

    def test_hardline_pattern_matches_nested_directory(self) -> None:
        self.assertRejected(self.commit("feat(EX-001): 改守卫", "src/auth/guards/jwt.ts"), "硬线")

    def test_hardline_line_full_width_colon_passes(self) -> None:
        self.assertAccepted(
            self.commit("feat(EX-001): 加表\n\n硬线：新增 0001 迁移", "db/migrations/0001_add.sql")
        )

    def test_hardline_line_ascii_colon_passes(self) -> None:
        self.assertAccepted(self.commit("feat(EX-001): 加表\n\n硬线: 新增迁移", "db/migrations/0001_add.sql"))

    def test_empty_hardline_line_is_rejected(self) -> None:
        self.assertRejected(self.commit("feat(EX-001): 加表\n\n硬线：", "db/migrations/0001_add.sql"), "硬线")

    def test_hardline_applies_to_fix_mode_too(self) -> None:
        result = self.commit("fix: 改迁移 Mode: fix", "db/migrations/0001_add.sql", "docs/testlog.md")
        self.assertRejected(result, "硬线")

    def test_deleting_hardline_file_is_detected(self) -> None:
        self.assertAccepted(self.commit("feat(EX-001): 加表\n\n硬线：新增", "db/migrations/0001_add.sql"))
        (self.root / "db/migrations/0001_add.sql").unlink()
        self.assertRejected(self.commit("fix(EX-002): 调整上传上限", "src/upload.ts"), "硬线")

    def test_renaming_hardline_file_out_is_detected(self) -> None:
        self.assertAccepted(self.commit("feat(EX-001): 加表\n\n硬线：新增", "db/migrations/0001_add.sql"))
        (self.root / "archive").mkdir()
        moved = self.git("mv", "db/migrations/0001_add.sql", "archive/0001_add.sql")
        self.assertEqual(moved.returncode, 0, moved.stderr)
        self.assertRejected(self.git("commit", "-q", "-m", "chore(EX-002): 整理"), "硬线")

    def test_commented_out_hardline_is_inactive(self) -> None:
        self.assertAccepted(self.commit("docs(EX-001): 改说明", "docs/specs/orders.md"))

    def test_non_hardline_path_passes(self) -> None:
        self.assertAccepted(self.commit("feat(EX-001): 前端", "src/authz-page.ts", "dbx/migrations.ts"))

    def test_glob_in_conf_is_not_expanded_against_worktree(self) -> None:
        # 目录里还有别的文件时，没有 set -f 的话 * 会先展开成 keep.txt，删掉的迁移就匹配不到了
        self.write("db/migrations/keep.txt")
        self.write("db/migrations/0001_add.sql")
        self.git("add", "-A")
        self.git("commit", "-q", "--no-verify", "-m", "seed")
        (self.root / "db/migrations/0001_add.sql").unlink()
        self.assertRejected(self.commit("fix(EX-002): 调整上传上限", "src/upload.ts"), "硬线")

    def test_verbose_diff_after_scissors_is_ignored(self) -> None:
        # git commit -v 把差异附在剪刀线之后交给钩子；差异里的 "Mode: fix" 不算提交信息
        self.write("src/page.ts", "Mode: fix\n")
        self.git("add", "src/page.ts")
        result = self.git("commit", "-q", "-e", "-v", "-m", "feat(EX-001): 新页面", env={"GIT_EDITOR": "true"})
        self.assertAccepted(result)

    def test_missing_conf_skips_hardline_check(self) -> None:
        (self.root / "scripts/workflow.conf").unlink()
        self.assertAccepted(self.commit("feat(EX-001): 加表", "db/migrations/0001_add.sql"))

    def test_crlf_conf_and_message_are_handled(self) -> None:
        (self.root / "scripts/workflow.conf").write_bytes(CONF.replace("\n", "\r\n").encode("utf-8"))
        self.assertRejected(self.commit("feat(EX-001): 加表", "db/migrations/0001_add.sql"), "硬线")
        (self.root / "msg.txt").write_bytes("feat(EX-001): 加表\r\n\r\n硬线：新增\r\n".encode("utf-8"))
        self.write("db/migrations/0001_add.sql", "z\n")
        self.git("add", "db/migrations/0001_add.sql")
        self.assertAccepted(self.git("commit", "-q", "--cleanup=verbatim", "-F", "msg.txt"))

    def test_merge_commit_is_not_checked(self) -> None:
        self.git("checkout", "-q", "-b", "side")
        self.assertAccepted(self.commit("feat(EX-001): 加表\n\n硬线：新增", "db/migrations/0001_add.sql"))
        self.git("checkout", "-q", "-")
        self.assertAccepted(self.commit("feat(EX-002): 别的", "src/other.ts"))
        self.assertAccepted(self.git("merge", "--no-ff", "-q", "side", "-m", "Merge side"))

    # 3. 改了代码的提交要有归属
    def test_code_commit_without_owner_is_rejected(self) -> None:
        self.assertRejected(self.commit("feat: 新页面", "src/page.ts"), "归属")

    def test_unknown_unit_id_is_not_an_owner(self) -> None:
        self.assertRejected(self.commit("fix: HTTP-404 页面", "src/page.ts"), "归属")
        self.assertRejected(self.commit("feat(EX-009): 新页面", "src/page.ts"), "归属")

    def test_unit_trailer_is_an_owner(self) -> None:
        self.assertAccepted(self.commit("feat: 新页面\n\nUnit: EX-002", "src/page.ts"))

    def test_unit_none_is_accepted(self) -> None:
        self.assertAccepted(self.commit("chore: 升级构建脚本\n\nUnit: none", "tools/build.js"))

    def test_docs_only_commit_needs_no_owner(self) -> None:
        self.assertAccepted(self.commit("docs: 改说明", "docs/specs/orders.md", "README.md"))

    def test_first_commit_needs_no_owner(self) -> None:
        self.git("checkout", "-q", "--orphan", "fresh")
        self.assertAccepted(self.commit("init: 套模板", "src/page.ts"))

    # 4. 只有一个单元在做时自动补归属
    def test_single_in_progress_unit_is_filled_in(self) -> None:
        self.unit("EX-003-doing", "in_progress")
        self.assertAccepted(self.commit("feat: 新页面", "src/page.ts"))
        message = self.last_message()
        self.assertTrue(message.startswith("feat: 新页面\n"), message)
        self.assertIn("\nUnit: EX-003\n", message)

    def test_two_in_progress_units_are_not_guessed(self) -> None:
        self.unit("EX-003-doing", "in_progress")
        self.unit("EX-004-doing", "in_progress")
        self.assertRejected(self.commit("feat: 新页面", "src/page.ts"), "归属")

    def test_explicit_owner_is_left_alone(self) -> None:
        self.unit("EX-003-doing", "in_progress")
        self.assertAccepted(self.commit("fix: 改文案 Mode: fix", "src/a.ts", "docs/testlog.md"))
        self.assertNotIn("Unit:", self.last_message())
        self.assertAccepted(self.commit("fix(EX-002): 回修", "src/b.ts"))
        self.assertNotIn("Unit:", self.last_message())
        self.assertAccepted(self.commit("chore: 构建脚本\n\nUnit: none", "src/c.ts"))
        self.assertNotIn("EX-003", self.last_message())

    def test_fill_in_keeps_editor_comments_out_of_message(self) -> None:
        self.unit("EX-003-doing", "in_progress")
        self.write("src/page.ts", "y\n")
        self.git("add", "-A")
        result = self.git("commit", "-q", "-e", "-m", "feat: 新页面", env={"GIT_EDITOR": "true"})
        self.assertAccepted(result)
        self.assertEqual(self.last_message().strip(), "feat: 新页面\n\nUnit: EX-003")

    def test_merge_commit_is_not_filled_in(self) -> None:
        self.unit("EX-003-doing", "in_progress")
        self.git("add", "-A")
        self.git("commit", "-q", "--no-verify", "-m", "seed")
        self.git("checkout", "-q", "-b", "side")
        self.assertAccepted(self.commit("feat(EX-001): 旁支", "src/side.ts"))
        self.git("checkout", "-q", "-")
        self.assertAccepted(self.commit("feat(EX-002): 主线", "src/main.ts"))
        self.assertAccepted(self.git("merge", "--no-ff", "-q", "side", "-m", "Merge side"))
        self.assertNotIn("Unit:", self.last_message())


if __name__ == "__main__":
    unittest.main()
