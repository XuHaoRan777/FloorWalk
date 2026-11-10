import { Body, Controller, Inject, Post } from '@nestjs/common';
import {
  apiRoutePath,
  apiRoutes,
  requestEmailCodeRequestSchema,
  requestEmailCodeResponseSchema,
} from '@libs/shared';
import { EmailVerificationService } from './email-verification.js';

const requestMessage = '如果该邮箱可接收验证码，请查看邮箱。';

@Controller('api')
export class VerificationController {
  constructor(
    @Inject(EmailVerificationService)
    private readonly verification: EmailVerificationService,
  ) {}

  @Post(apiRoutePath(apiRoutes.requestRegistrationCode))
  async requestRegistrationCode(@Body() body: unknown) {
    const { email } = requestEmailCodeRequestSchema.parse(body);
    await this.verification.requestRegistrationCode(email);
    return requestEmailCodeResponseSchema.parse({ message: requestMessage });
  }
}
