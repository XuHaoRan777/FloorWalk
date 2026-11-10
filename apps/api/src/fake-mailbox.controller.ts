import { Controller, Get, NotFoundException, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { emailSchema } from '@libs/shared';
import { readFakeMailbox } from './email/fake.js';

const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

@Controller('api/testing')
export class FakeMailboxController {
  @Get('mailbox')
  getLatest(@Query('recipient') recipient: unknown, @Req() request: Request) {
    if (
      process.env.NODE_ENV === 'production' ||
      !process.env.FW_SLOT ||
      process.env.MAIL_DRIVER !== 'fake' ||
      !loopbackAddresses.has(request.socket.remoteAddress ?? '')
    )
      throw new NotFoundException();
    const email = emailSchema.parse(recipient);
    const message = readFakeMailbox(email).at(-1);
    if (!message) throw new NotFoundException();
    return { subject: message.subject, code: message.code };
  }
}
