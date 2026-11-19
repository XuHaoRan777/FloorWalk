import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'scripts' / 'dev' / 'proc.mjs'


class DevProcTests(unittest.TestCase):
    def run_proc(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ['node', str(SCRIPT), *args],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=10,
        )

    def test_local_api_status(self) -> None:
        result = self.run_proc('status', 'api', '--local')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('api local port=3018 listening=', result.stdout)
        self.assertIn('registered=', result.stdout)

    def test_local_web_status(self) -> None:
        result = self.run_proc('status', 'web', '--local')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('web local port=3019 listening=', result.stdout)

    def test_slot_status_keeps_existing_ports(self) -> None:
        for name, port in [('api', 3110), ('metro', 3112)]:
            with self.subTest(name=name):
                result = self.run_proc('status', name, '--slot', '1')
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(f'{name} slot=1 port={port} listening=', result.stdout)

    def test_invalid_start_targets_fail_before_launch(self) -> None:
        for args in [
            ('api', '--local', '--slot', '1'),
            ('web', '--slot', '1'),
            ('metro', '--local'),
            ('api',),
            ('api', '--slot', '0'),
            ('api', '--slot', '4'),
            ('api', '--local', '--local'),
            ('api', '--slot', '1', '--slot', '2'),
        ]:
            with self.subTest(args=args):
                result = self.run_proc('start', *args)
                self.assertEqual(result.returncode, 1)
                self.assertIn('proc:', result.stderr)
                self.assertNotIn('started ', result.stdout)


if __name__ == '__main__':
    unittest.main()
