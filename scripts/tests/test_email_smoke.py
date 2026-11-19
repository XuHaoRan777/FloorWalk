import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
HARNESS = r'''
import { runEmailTest, reserveEmailAttempt } from './scripts/test-email.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const scenario = JSON.parse(input);
if (scenario.budget) {
  const claims = new Set();
  const fileSystem = {
    mkdir: async () => undefined,
    open: async (path, flag) => {
      if (flag !== 'wx') throw new Error('Expected exclusive creation.');
      if (claims.has(path)) throw Object.assign(new Error(), { code: 'EEXIST' });
      claims.add(path);
      return { close: async () => undefined };
    },
  };
  const attempts = await Promise.all(
    Array.from({ length: 8 }, () => reserveEmailAttempt(fileSystem)),
  );
  console.log(JSON.stringify({ attempts, claims: claims.size }));
} else {
  const answers = [...(scenario.answers ?? ['manager@example.test', '测试'])];
  const messages = [];
  const prompts = [];
  let requests = 0;
  let claims = 0;
  const exitCode = await runEmailTest({
    environment: {
      MAIL_DRIVER: 'resend',
      MAIL_FROM_ADDRESS: 'sender@example.test',
      RESEND_API_KEY: '[REDACTED]',
      RESEND_TEMPLATE_ID: 'verification-code',
      ...scenario.environment,
    },
    ask: async (prompt) => {
      prompts.push(prompt);
      return answers.shift() ?? null;
    },
    print: (message) => messages.push(message),
    reserveAttempt: async () => {
      claims += 1;
      return scenario.exhausted ? null : 1;
    },
    fetcher: async () => {
      requests += 1;
      if (scenario.networkError) throw new Error('[REDACTED]');
      return new Response(
        scenario.body ?? JSON.stringify({ id: '00000000-0000-4000-8000-000000000001' }),
        { status: scenario.status ?? 200 },
      );
    },
  });
  console.log(JSON.stringify({ exitCode, requests, claims, prompts, messages }));
}
'''


class EmailSmokeTests(unittest.TestCase):
    def run_case(self, **scenario: object) -> dict:
        result = subprocess.run(
            ['node', '--import=tsx', '--input-type=module', '-e', HARNESS],
            input=json.dumps(scenario),
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('[REDACTED]', result.stdout)
        return json.loads(result.stdout)

    def test_confirmation_sends_once_and_reports_receipt(self) -> None:
        result = self.run_case()
        self.assertEqual(result['exitCode'], 0)
        self.assertEqual(result['requests'], 1)
        self.assertEqual(result['claims'], 1)
        self.assertEqual(len(result['prompts']), 2)
        self.assertIn('消息 ID', '\n'.join(result['messages']))
        self.assertIn('不能用于注册', '\n'.join(result['messages']))

    def test_cancel_and_eof_do_not_send_or_claim_budget(self) -> None:
        for answers in [[], ['manager@example.test'], ['manager@example.test', '取消']]:
            with self.subTest(answers=answers):
                result = self.run_case(answers=answers)
                self.assertEqual(result['exitCode'], 0)
                self.assertEqual(result['requests'], 0)
                self.assertEqual(result['claims'], 0)

    def test_invalid_email_never_asks_for_confirmation(self) -> None:
        result = self.run_case(answers=['not-an-email', '测试'])
        self.assertEqual(result['exitCode'], 1)
        self.assertEqual(len(result['prompts']), 1)
        self.assertEqual(result['requests'], 0)
        self.assertEqual(result['claims'], 0)

    def test_configuration_is_checked_without_printing_values(self) -> None:
        for environment in [
            {'MAIL_DRIVER': 'fake'},
            {'MAIL_FROM_ADDRESS': ''},
            {'RESEND_API_KEY': ''},
            {'RESEND_TEMPLATE_ID': ''},
        ]:
            with self.subTest(environment=environment):
                result = self.run_case(environment=environment)
                self.assertEqual(result['exitCode'], 1)
                self.assertEqual(result['requests'], 0)
                self.assertEqual(result['claims'], 0)
                self.assertEqual(result['prompts'], [])

    def test_provider_and_network_failures_are_not_retried(self) -> None:
        for scenario in [
            {'status': 422, 'body': '[REDACTED]'},
            {'networkError': True},
            {'body': 'not-json'},
            {'body': '{"id":"[REDACTED]"}'},
        ]:
            with self.subTest(scenario=scenario):
                result = self.run_case(**scenario)
                self.assertEqual(result['exitCode'], 1)
                self.assertEqual(result['requests'], 1)
                self.assertEqual(result['claims'], 1)

    def test_exhausted_budget_does_not_send(self) -> None:
        result = self.run_case(exhausted=True)
        self.assertEqual(result['exitCode'], 1)
        self.assertEqual(result['requests'], 0)

    def test_concurrent_budget_claims_stop_at_five(self) -> None:
        result = self.run_case(budget=True)
        self.assertEqual(result['claims'], 5)
        self.assertEqual(sorted(value for value in result['attempts'] if value), [1, 2, 3, 4, 5])
        self.assertEqual(result['attempts'].count(None), 3)


if __name__ == '__main__':
    unittest.main()
