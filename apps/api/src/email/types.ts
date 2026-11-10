export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export type EmailPurpose = 'registration' | 'password_recovery';

export type VerificationEmail = {
  recipient: string;
  subject: string;
  code: string;
};

export interface EmailSender {
  sendVerificationCode(email: VerificationEmail): Promise<void>;
}
