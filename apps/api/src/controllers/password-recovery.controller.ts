import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import {
  apiRoutePath,
  apiRoutes,
  requestEmailCodeRequestSchema,
  requestEmailCodeResponseSchema,
  resetPasswordRecoveryRequestSchema,
  verifyPasswordRecoveryCodeRequestSchema,
  verifyPasswordRecoveryCodeResponseSchema,
} from '@libs/shared';
import { EmailVerificationService } from '../services/email-verification.js';

const requestMessage = '如果该邮箱可接收验证码，请查看邮箱。';

@Controller('api')
export class PasswordRecoveryController {
  constructor(
    @Inject(EmailVerificationService)
    private readonly verification: EmailVerificationService,
  ) {}

  @Post(apiRoutePath(apiRoutes.requestPasswordRecoveryCode))
  async requestCode(@Body() body: unknown) {
    const { email } = requestEmailCodeRequestSchema.parse(body);
    await this.verification.requestPasswordRecoveryCode(email);
    return requestEmailCodeResponseSchema.parse({ message: requestMessage });
  }

  @Post(apiRoutePath(apiRoutes.verifyPasswordRecoveryCode))
  async verifyCode(@Body() body: unknown) {
    const input = verifyPasswordRecoveryCodeRequestSchema.parse(body);
    return verifyPasswordRecoveryCodeResponseSchema.parse(
      await this.verification.verifyPasswordRecoveryCode(
        input.email,
        input.code,
      ),
    );
  }

  @Post(apiRoutePath(apiRoutes.resetPasswordRecovery))
  @HttpCode(204)
  async resetPassword(@Body() body: unknown) {
    const input = resetPasswordRecoveryRequestSchema.parse(body);
    await this.verification.resetPasswordRecovery(input);
  }
}
