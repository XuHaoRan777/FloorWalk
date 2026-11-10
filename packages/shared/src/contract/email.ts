import { z } from 'zod';
import { organizationSummarySchema, uuid } from './identity.js';

export const emailSchema = z.string().email();
export const emailVerificationCodeSchema = z.string().regex(/^\d{6}$/);

export const requestEmailCodeRequestSchema = z.object({ email: emailSchema });
export const requestEmailCodeResponseSchema = z.object({
  message: z.string().min(1),
});

export const verifyPasswordRecoveryCodeRequestSchema = z.object({
  email: emailSchema,
  code: emailVerificationCodeSchema,
});
export const verifyPasswordRecoveryCodeResponseSchema = z.object({
  resetToken: z.string().min(1),
  organizations: z.array(organizationSummarySchema).min(1),
});

export const resetPasswordRecoveryRequestSchema = z.object({
  resetToken: z.string().min(1),
  orgId: uuid,
  password: z.string().min(8),
});

export type RequestEmailCodeRequest = z.infer<
  typeof requestEmailCodeRequestSchema
>;
export type RequestEmailCodeResponse = z.infer<
  typeof requestEmailCodeResponseSchema
>;
export type VerifyPasswordRecoveryCodeRequest = z.infer<
  typeof verifyPasswordRecoveryCodeRequestSchema
>;
export type VerifyPasswordRecoveryCodeResponse = z.infer<
  typeof verifyPasswordRecoveryCodeResponseSchema
>;
export type ResetPasswordRecoveryRequest = z.infer<
  typeof resetPasswordRecoveryRequestSchema
>;
