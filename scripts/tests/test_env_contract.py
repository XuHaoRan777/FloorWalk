import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.tests.test_validate_docs import (
    CONF,
    SCRIPT_PATH,
    create_valid_root,
    load_validator,
    register_backlog,
    write_file,
)


ATTR = "# 凭据：否；缺失：启动失败；说明\n"
OPTIONAL_ATTR = "# 凭据：否；缺失：用默认值；说明\n"


def spec(unit_id: str, body: str, approved: str = "2026-11-06") -> str:
    return (
        f"# Example\n\n> ID：`{unit_id}`\n>\n> 状态：`approved`\n\n## 验收标准\n\n{body}\n\n"
        f"## 批准记录\n\n- 批准时间：`{approved}`\n"
    )


def plan(archive: str = "active", status: str = "in_progress") -> str:
    return f"# Plan\n\n## 当前状态\n\n- 工作单元状态：`{status}`\n- 归档状态：`{archive}`\n"


class EnvContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.validator = load_validator()
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        create_valid_root(self.root)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def conf(self, extra: str) -> None:
        write_file(self.root, "scripts/workflow.conf", CONF + extra)

    def codes(self) -> list[str]:
        return sorted(issue.code for issue in self.validator.validate_repository(self.root))

    def messages(self, code: str) -> list[str]:
        return [i.message for i in self.validator.validate_repository(self.root) if i.code == code]

    # 不配 env-* 就不查
    def test_no_conf_no_env_checks(self) -> None:
        write_file(self.root, "api/.env.example", "DEAD=1\n")
        self.assertEqual(self.codes(), [])

    def test_consistent_group_passes(self) -> None:
        self.conf("env-group api/.env.example api/**/*.yml\n")
        write_file(self.root, "api/.env.example", ATTR + "DB_URL=<url>\n" + OPTIONAL_ATTR + "PORT=3000\n")
        write_file(self.root, "api/src/application.yml", "url: ${DB_URL}\nport: ${PORT:3000}\n")
        self.assertEqual(self.codes(), [])

    # AGENT_CENTER_BASE_URL：模板列了键，引用方写死值没读它
    def test_dead_key_is_reported(self) -> None:
        self.conf("env-group deploy/.env.example deploy/docker-compose.yml\n")
        write_file(self.root, "deploy/.env.example", ATTR + "AGENT_CENTER_BASE_URL=http://agent:3010\n")
        write_file(self.root, "deploy/docker-compose.yml", "    AGENT_CENTER_BASE_URL: http://agent:3010\n")
        self.assertEqual(self.codes(), ["env-dead-key"])

    def test_required_reference_missing_from_template(self) -> None:
        self.conf("env-group api/.env.example api/*.yml\n")
        write_file(self.root, "api/.env.example", ATTR + "DB_URL=<url>\n")
        write_file(self.root, "api/app.yml", "a: ${DB_URL}\nb: ${S3_REGION}\nc: ${OPT:-x}\nd: {$SILO}\n")
        self.assertEqual(self.messages("env-missing-key"), [
            "S3_REGION 被引用且无默认值，模板里没有",
            "SILO 被引用且无默认值，模板里没有",
        ])

    def test_missing_attr_comment_is_reported(self) -> None:
        self.conf("env-group api/.env.example api/*.yml\n")
        write_file(self.root, "api/.env.example", "# 普通说明\nDB_URL=<url>\n")
        write_file(self.root, "api/app.yml", "a: ${DB_URL}\n")
        self.assertEqual(self.codes(), ["env-attr"])

    def test_python_settings_fields(self) -> None:
        self.conf("env-group py/.env.example py/*.py\n")
        write_file(self.root, "py/.env.example", ATTR + "LLM_API_KEY=<secret>\n")
        write_file(
            self.root,
            "py/config.py",
            "from typing import ClassVar\n"
            "class Settings(BaseSettings):\n"
            "    model_config = {}\n"
            "    llm_api_key: str\n"
            "    drive_db_host: str\n"
            "    timeout: float = 30.0\n"
            "    LIMIT: ClassVar[int] = 3\n",
        )
        self.assertEqual(self.messages("env-missing-key"), ["DRIVE_DB_HOST 被引用且无默认值，模板里没有"])

    def test_js_reference_counts_as_read_but_not_required(self) -> None:
        self.conf("env-group web/.env.example web/src/*.ts\n")
        write_file(self.root, "web/.env.example", ATTR + "VITE_API_BASE_URL=<url>\n")
        write_file(self.root, "web/src/a.ts", "import.meta.env.VITE_API_BASE_URL; import.meta.env.VITE_OTHER\n")
        self.assertEqual(self.codes(), [])

    # Web 经解析函数读键；TS 模板字符串里的 ${X} 不是配置占位符
    def test_ts_interpolation_and_indirect_read(self) -> None:
        self.conf("env-group web/.env.example web/src/*.ts\n")
        write_file(self.root, "web/.env.example", ATTR + "VITE_API_BASE_URL=<url>\n")
        write_file(self.root, "web/src/env.ts", "const u = `${ACCOUNT_API}/x`;\nparse(source.VITE_API_BASE_URL);\n")
        self.assertEqual(self.codes(), [])

    def test_ignored_framework_key(self) -> None:
        self.conf("env-group api/.env.example api/*.yml\nenv-ignore SPRING_PROFILES_ACTIVE\n")
        write_file(self.root, "api/.env.example", ATTR + "SPRING_PROFILES_ACTIVE=prod\n")
        write_file(self.root, "api/app.yml", "x: 1\n")
        self.assertEqual(self.codes(), [])

    def test_missing_template_is_reported(self) -> None:
        self.conf("env-group api/.env.example api/*.yml\n")
        self.assertEqual(self.codes(), ["env-group"])

    # agent_python/.env 被跟踪
    def test_tracked_env_is_reported_only_when_enabled(self) -> None:
        write_file(self.root, "py/.env", "X=1\n")
        write_file(self.root, "py/.env.example", "X=\n")
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        subprocess.run(["git", "add", "-A"], cwd=self.root, check=True)
        self.assertEqual(self.codes(), [])
        self.conf("env-untracked on\n")
        subprocess.run(["git", "add", "-A"], cwd=self.root, check=True)
        issues = [i for i in self.validator.validate_repository(self.root) if i.code == "env-tracked"]
        self.assertEqual([i.path for i in issues], ["py/.env"])


class CrossUnitAcTests(unittest.TestCase):
    def setUp(self) -> None:
        self.validator = load_validator()
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        create_valid_root(self.root)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def unit(self, name: str, body: str, *, approved: str = "2026-11-06", archive: str = "active") -> None:
        status = "verified" if archive == "archived" else "in_progress"
        write_file(self.root, f"docs/work/{name}/spec.md", spec(name[:6], body, approved))
        write_file(self.root, f"docs/work/{name}/plan.md", plan(archive, status))

    def codes(self) -> list[str]:
        return sorted(issue.code for issue in self.validator.validate_repository(self.root))

    # ACD-005：真实域名验收并入 ACD-006 AC-08
    def test_reference_to_other_unit_ac_is_reported(self) -> None:
        self.unit("EX-005-deploy", "- AC-02（`用户要求`）：证书签发并入 EX-006 AC-08。")
        register_backlog(self.root, [("EX-005", "EX-005-deploy", "in_progress")])
        self.assertEqual(self.codes(), ["cross-unit-ac"])

    def test_own_ac_and_comments_are_allowed(self) -> None:
        self.unit("EX-005-deploy", "<!-- 如 EX-006 AC-08 -->\n- AC-01：见本单元 EX-005 AC-02。")
        register_backlog(self.root, [("EX-005", "EX-005-deploy", "in_progress")])
        self.assertEqual(self.codes(), [])

    def test_archived_and_older_specs_are_not_checked(self) -> None:
        write_file(self.root, "scripts/workflow.conf", CONF + "cross-unit-ac-since 2026-11-06\n")
        self.unit("EX-004-old", "- AC-01：并入 EX-006 AC-08。", approved="2026-11-05")
        self.unit("EX-003-done", "- AC-01：并入 EX-006 AC-08。", archive="archived")
        register_backlog(self.root, [("EX-004", "EX-004-old", "in_progress")])
        self.assertEqual(self.codes(), [])


class EnvKeysCliTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        create_valid_root(self.root)
        write_file(self.root, "scripts/workflow.conf", CONF + "env-group api/.env.example api/*.yml\n")
        write_file(
            self.root,
            "api/.env.example",
            ATTR + "DB_URL=<url>\n" + ATTR + "DB_PASSWORD=<secret>\n" + OPTIONAL_ATTR + "PORT=3000\n",
        )

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def run_cli(self) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(SCRIPT_PATH), "--root", str(self.root), "--env-keys"],
            capture_output=True, text=True, encoding="utf-8", check=False,
        )

    def test_reports_missing_required_keys_without_values(self) -> None:
        write_file(self.root, "api/.env", "DB_URL=jdbc:real-host-value\nEXTRA=leak-me\n")
        result = self.run_cli()
        self.assertEqual(result.returncode, 1)
        self.assertIn("缺 DB_PASSWORD", result.stdout)
        self.assertNotIn("PORT", result.stdout.replace("模板里没有的键", ""))
        self.assertIn("EXTRA", result.stdout)
        self.assertNotIn("real-host-value", result.stdout)
        self.assertNotIn("leak-me", result.stdout)

    def test_complete_local_file_passes(self) -> None:
        write_file(self.root, "api/.env", "DB_URL=x\nDB_PASSWORD=y\n")
        self.assertEqual(self.run_cli().returncode, 0)

    def test_missing_local_file_is_reported(self) -> None:
        result = self.run_cli()
        self.assertEqual(result.returncode, 1)
        self.assertIn("本地文件不存在", result.stdout)
