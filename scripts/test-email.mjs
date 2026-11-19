import { randomInt } from 'node:crypto';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { reserveEmailAttempt } from '../apps/api/src/email/attempt-budget.ts';
import { ResendEmailSender } from '../apps/api/src/email/resend.ts';
import { emailSchema } from '../packages/shared/src/contract/email.ts';

/**
 * @param {{
 *   environment: NodeJS.ProcessEnv,
 *   ask: (prompt: string) => Promise<string | null>,
 *   print: (message: string) => void,
 *   fetcher?: typeof fetch,
 *   reserveAttempt?: () => Promise<number | null>,
 * }} options
 */
export async function runEmailTest({
  environment,
  ask,
  print,
  fetcher = fetch,
  reserveAttempt = reserveEmailAttempt,
}) {
  if (environment.MAIL_DRIVER !== 'resend') {
    print('测试未启动：请先将 MAIL_DRIVER 配置为 resend。');
    return 1;
  }
  const config = {
    from: environment.MAIL_FROM_ADDRESS ?? '',
    apiKey: environment.RESEND_API_KEY ?? '',
    templateId: environment.RESEND_TEMPLATE_ID ?? '',
  };
  const missing = Object.entries({
    MAIL_FROM_ADDRESS: config.from,
    RESEND_API_KEY: config.apiKey,
    RESEND_TEMPLATE_ID: config.templateId,
  })
    .filter(([, value]) => !value.trim())
    .map(([key]) => key);
  if (missing.length) {
    print(`测试未启动：缺少配置键 ${missing.join('、')}。`);
    return 1;
  }

  const recipient = await ask('请输入收件邮箱：');
  if (recipient === null) {
    print('已取消，未发送邮件。');
    return 0;
  }
  const email = emailSchema.safeParse(recipient.trim());
  if (!email.success) {
    print('邮箱格式不正确，未发送邮件。');
    return 1;
  }
  print('仅测试邮件发送；邮件中的测试码不能用于注册或找回密码。');
  const confirmation = await ask(
    `将向 ${email.data} 发送一封邮件。输入“测试”并回车确认，其他输入取消：`,
  );
  if (confirmation?.trim() !== '测试') {
    print('已取消，未发送邮件。');
    return 0;
  }

  /** @type {{ status: number | null, id: string | null }} */
  const receipt = { status: null, id: null };
  try {
    const attempt = await reserveAttempt();
    if (attempt === null) {
      print('FW-039 已用完 5 次真实发信额度，未发送邮件。');
      return 1;
    }
    print(`本单元已占用发信额度：${attempt}/5；本次只发送一封，不自动重试。`);
    /** @type {typeof fetch} */
    const observeResponse = async (...args) => {
      const response = await fetcher(...args);
      receipt.status = response.status;
      if (response.ok) {
        const body = await response
          .clone()
          .json()
          .catch(() => null);
        if (
          typeof body?.id === 'string' &&
          /^[a-zA-Z0-9_-]{1,200}$/.test(body.id)
        ) {
          receipt.id = body.id;
        }
      }
      return response;
    };
    const sender = new ResendEmailSender(
      config,
      observeResponse,
      async () => attempt,
    );
    await sender.sendVerificationCode({
      recipient: email.data,
      subject: 'FloorWalk 邮箱验证码',
      code: String(randomInt(100_000, 1_000_000)),
    });
    print(`Resend HTTP：${receipt.status}`);
    if (!receipt.id) {
      print(
        '服务商已接受请求，但未取得有效消息 ID。请先核对后台，不要直接重试。',
      );
      return 1;
    }
    print(`Resend 消息 ID：${receipt.id}`);
    print('发信请求成功。请到收件箱或垃圾邮件中确认实际送达和邮件内容。');
    return 0;
  } catch {
    if (receipt.status !== null) print(`Resend HTTP：${receipt.status}`);
    print('发信未能确认成功。请核对配置、网络及 Resend 后台；未自动重试。');
    return 1;
  }
}

export { reserveEmailAttempt };

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const lines = terminal[Symbol.asyncIterator]();
  terminal.on('SIGINT', () => terminal.close());
  try {
    process.exitCode = await runEmailTest({
      environment: process.env,
      ask: async (prompt) => {
        process.stdout.write(prompt);
        const line = await lines.next();
        return line.done ? null : line.value;
      },
      print: (message) => console.log(message),
    });
  } catch {
    console.error('测试未完成；未自动重试。请检查依赖、配置和本地文件权限。');
    process.exitCode = 1;
  } finally {
    terminal.close();
  }
}
