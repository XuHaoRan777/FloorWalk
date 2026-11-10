import type { EmailSender, VerificationEmail } from './types.js';

const mailbox: VerificationEmail[] = [];

export function readFakeMailbox(recipient: string) {
  return mailbox.filter((email) => email.recipient === recipient);
}

export function clearFakeMailbox() {
  mailbox.length = 0;
}

export class FakeEmailSender implements EmailSender {
  async sendVerificationCode(email: VerificationEmail) {
    mailbox.push({ ...email });
  }
}
