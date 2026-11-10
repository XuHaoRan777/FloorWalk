import { APP_NAME } from '@libs/shared';
import type { EmailSender, VerificationEmail } from './types.js';

export type ResendConfig = {
  from: string;
  apiKey: string;
  templateId: string;
};

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly config: ResendConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async sendVerificationCode(email: VerificationEmail) {
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
  }
}
