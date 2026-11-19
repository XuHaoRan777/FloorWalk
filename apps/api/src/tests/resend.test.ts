import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResendEmailSender } from '../email/resend.js';

const config = {
  from: 'sender@example.test',
  apiKey: '[REDACTED]',
  templateId: 'verification-code',
};
const email = {
  recipient: 'manager@example.test',
  subject: 'FloorWalk 邮箱验证码',
  code: '123456',
};

describe('Resend message receipt logging', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('logs only a safe message ID in development', async () => {
    process.env.NODE_ENV = 'development';
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const reserveAttempt = vi.fn().mockResolvedValue(3);
    const sender = new ResendEmailSender(
      config,
      async () =>
        new Response(
          JSON.stringify({ id: '00000000-0000-4000-8000-000000000001' }),
          { status: 200 },
        ),
      reserveAttempt,
    );

    await sender.sendVerificationCode(email);

    expect(log).toHaveBeenCalledWith(
      'Resend accepted message id=00000000-0000-4000-8000-000000000001',
    );
    expect(log).toHaveBeenCalledWith('FW-039 email send attempt=3/5');
    expect(reserveAttempt).toHaveBeenCalledOnce();
    expect(log.mock.calls.flat().join(' ')).not.toContain(email.code);
    expect(log.mock.calls.flat().join(' ')).not.toContain(email.recipient);
    expect(log.mock.calls.flat().join(' ')).not.toContain(config.apiKey);
  });

  it('does not log message IDs outside development or malformed IDs', async () => {
    process.env.NODE_ENV = 'production';
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const sender = new ResendEmailSender(
      config,
      async () =>
        new Response(JSON.stringify({ id: '[REDACTED]' }), { status: 200 }),
    );

    await sender.sendVerificationCode(email);

    expect(log).not.toHaveBeenCalled();
  });

  it('does not expose provider error responses', async () => {
    process.env.NODE_ENV = 'development';
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const reserveAttempt = vi.fn().mockResolvedValue(4);
    const sender = new ResendEmailSender(
      config,
      async () => new Response('[REDACTED]', { status: 422 }),
      reserveAttempt,
    );

    await expect(sender.sendVerificationCode(email)).rejects.toThrow(
      'Resend 邮件发送失败。',
    );
    expect(log).toHaveBeenCalledWith('FW-039 email send attempt=4/5');
    expect(log.mock.calls.flat().join(' ')).not.toContain(email.code);
    expect(log.mock.calls.flat().join(' ')).not.toContain(email.recipient);
    expect(log.mock.calls.flat().join(' ')).not.toContain(config.apiKey);
  });

  it('does not call Resend after the development email budget is exhausted', async () => {
    process.env.NODE_ENV = 'development';
    const fetcher = vi.fn<typeof fetch>();
    const sender = new ResendEmailSender(config, fetcher, async () => null);

    await expect(sender.sendVerificationCode(email)).rejects.toThrow(
      'FW-039 已用完 5 次真实发信额度。',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
