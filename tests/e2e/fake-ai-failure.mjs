import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const slot = Number(process.env.FW_SLOT);
if (!Number.isInteger(slot) || slot < 1 || slot > 3)
  throw new Error('假模型失败注入只能在 e2e 槽位运行。');
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const entry = path.resolve(process.argv[1] ?? '');
const apiEntries = [
  path.join(root, `apps/api/.e2e/slot-${slot}/dist/main.js`),
  path.join(root, 'apps/api/dist/main.js'),
];
if (apiEntries.includes(entry)) {
  const { FakeAiReviewer } = await import(
    pathToFileURL(path.join(path.dirname(entry), 'ai/fake.js')).href
  );
  const review = FakeAiReviewer.prototype.review;
  const failingReviewer = new FakeAiReviewer(async () => {
    throw new Error('FW-031 injected model failure');
  });

  // The production bootstrap and queue still run; only this test prompt fails.
  FakeAiReviewer.prototype.review = function (input) {
    return review.call(
      input.reviewPrompt === 'FW-031 fake model failure'
        ? failingReviewer
        : this,
      input,
    );
  };
} else if (entry !== path.join(root, 'scripts/dev/proc.mjs')) {
  throw new Error('假模型失败注入只能由测试 API 或槽位起停脚本启动。');
}
