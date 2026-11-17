import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { verifyStorageSignedUrl } from '../storage/signed-url.js';
import type { StorageDriver } from '../storage/types.js';

@Controller()
export class StorageController {
  constructor(
    @Inject('STORAGE_DRIVER') private readonly storage: StorageDriver,
  ) {}

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
    verifyStorageSignedUrl(
      storageKey,
      request.query.expires,
      request.query.signature,
    );
    const file = await this.storage.get(storageKey);
    response.type(file.mime);
    return new StreamableFile(file.stream);
  }
}
