import { Logger } from '@nestjs/common';
import { APP_NAME } from '@libs/shared';
import { reserveEmailAttempt } from './attempt-budget.js';
import type { EmailSender, VerificationEmail } from './types.js';

export type ResendConfig = {
  from: string;
  apiKey: string;
  templateId: string;
};

export class ResendEmailSender implements EmailSender {
  private readonly logger = new Logger(ResendEmailSender.name);

  constructor(
    private readonly config: ResendConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly reserveAttempt = reserveEmailAttempt,
  ) {}

  async sendVerificationCode(email: VerificationEmail) {
    if (process.env.NODE_ENV === 'development') {
      const attempt = await this.reserveAttempt();
      if (attempt === null) throw new Error('FW-039 已用完 5 次真实发信额度。');
      this.logger.log(`FW-039 email send attempt=${attempt}/5`);
    }
    const response = await this.fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.from,
        to: [email.recipient],
        template: {
          id: this.config.templateId,
          variables: {
            APP_NAME,
            CODE: email.code,
            EXPIRES_IN: '5 分钟',
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Resend 邮件发送失败。');
    if (process.env.NODE_ENV === 'development') {
      const body = await response
        .clone()
        .json()
        .catch(() => null);
      if (
        typeof body?.id === 'string' &&
        /^[a-zA-Z0-9_-]{1,200}$/.test(body.id)
      ) {
        this.logger.log(`Resend accepted message id=${body.id}`);
      }
    }
  }
}
