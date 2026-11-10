import { FakeEmailSender } from './fake.js';
import { ResendEmailSender } from './resend.js';
import type { EmailSender } from './types.js';

export { clearFakeMailbox, readFakeMailbox } from './fake.js';
export { ResendEmailSender } from './resend.js';
export { EMAIL_SENDER } from './types.js';
export type { EmailSender, EmailPurpose, VerificationEmail } from './types.js';

export function createEmailSender(
  environment: NodeJS.ProcessEnv = process.env,
): EmailSender {
  const driver = environment.MAIL_DRIVER ?? 'fake';
  if (driver === 'fake') return new FakeEmailSender();
  if (driver === 'resend') {
    const missing = [
      'MAIL_FROM_ADDRESS',
      'RESEND_API_KEY',
      'RESEND_TEMPLATE_ID',
    ].filter((key) => !environment[key]?.trim());
    if (missing.length)
      throw new Error(`Resend 配置缺失：${missing.join('、')}`);
    return new ResendEmailSender({
      from: environment.MAIL_FROM_ADDRESS!,
      apiKey: environment.RESEND_API_KEY!,
      templateId: environment.RESEND_TEMPLATE_ID!,
    });
  }
  throw new Error(`未知邮件驱动：${driver}`);
}
