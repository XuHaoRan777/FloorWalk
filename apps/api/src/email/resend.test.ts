import { describe, expect, it, vi } from 'vitest';
import { createEmailSender, ResendEmailSender } from './index.js';

describe('Resend email sender', () => {
  it('sends the configured template and verification variables without a real request', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    const sender = new ResendEmailSender(
      {
        from: 'FloorWalk <no-reply@mail.codexu-studio.com>',
        apiKey: 'test-resend-key',
        templateId: 'verification-code',
      },
      fetcher,
      async () => 1,
    );

    await sender.sendVerificationCode({
      recipient: 'manager@example.test',
      subject: 'FloorWalk 邮箱验证码',
      code: '123456',
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(request?.method).toBe('POST');
    expect(new Headers(request?.headers).get('Authorization')).toBe(
      'Bearer test-resend-key',
    );
    expect(JSON.parse(String(request?.body))).toEqual({
      from: 'FloorWalk <no-reply@mail.codexu-studio.com>',
      to: ['manager@example.test'],
      template: {
        id: 'verification-code',
        variables: {
          APP_NAME: 'FloorWalk',
          CODE: '123456',
          EXPIRES_IN: '5 分钟',
        },
      },
    });
  });

  it('requires all Resend credentials only when the Resend driver is selected', () => {
    expect(createEmailSender({ MAIL_DRIVER: 'fake' }).constructor.name).toBe(
      'FakeEmailSender',
    );
    expect(() => createEmailSender({ MAIL_DRIVER: 'resend' })).toThrow(
      'Resend 配置缺失：MAIL_FROM_ADDRESS、RESEND_API_KEY、RESEND_TEMPLATE_ID',
    );
  });

  it('does not include provider response details in send errors', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('private provider detail', { status: 403 }),
      );
    const sender = new ResendEmailSender(
      {
        from: 'sender@example.test',
        apiKey: 'test-key',
        templateId: 'template',
      },
      fetcher,
      async () => 1,
    );
    await expect(
      sender.sendVerificationCode({
        recipient: 'manager@example.test',
        subject: 'FloorWalk 邮箱验证码',
        code: '123456',
      }),
    ).rejects.toThrow('Resend 邮件发送失败。');
  });
});
