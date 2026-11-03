import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LocalStorageDriver } from './storage/index.js';

@Controller()
export class StorageController {
  @Get('storage/*key')
  async getFile(
    @Param('key') key: string | string[],
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    let storageKey: string;
    try {
      storageKey = decodeURIComponent(Array.isArray(key) ? key.join('/') : key);
    } catch {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '照片路径无效。',
      });
    }
    const storage = new LocalStorageDriver();
    await storage.verifySignedUrl(
      storageKey,
      request.query.expires,
      request.query.signature,
    );
    const file = await storage.get(storageKey);
    response.type(file.mime);
    return new StreamableFile(file.stream);
  }
}
