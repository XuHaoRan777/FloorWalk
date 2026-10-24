import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Response } from 'express';

@Controller()
export class StorageController {
  @Get('storage/*key')
  async getFile(
    @Param('key') key: string | string[],
    @Res() response: Response,
  ) {
    const storageDir = path.resolve(
      process.env.STORAGE_DIR ?? path.resolve('.storage'),
    );
    const storageRoot = await realpath(storageDir).catch(() => storageDir);
    const storageKey = Array.isArray(key) ? key.join('/') : key;
    const target = path.resolve(storageRoot, storageKey);
    const relativeTarget = path.relative(storageRoot, target);
    if (
      storageKey.length === 0 ||
      relativeTarget.startsWith('..') ||
      path.isAbsolute(relativeTarget)
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '照片路径无效。',
      });
    }

    let actualTarget: string;
    try {
      actualTarget = await realpath(target);
    } catch {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '照片不存在。',
      });
    }
    const actualRelativeTarget = path.relative(storageRoot, actualTarget);
    if (
      actualRelativeTarget.startsWith('..') ||
      path.isAbsolute(actualRelativeTarget)
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '照片路径无效。',
      });
    }

    const fileStat = await stat(actualTarget);
    if (!fileStat.isFile())
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '照片不存在。',
      });
    const contents = await readFile(actualTarget);
    response.type(path.extname(actualTarget) || 'application/octet-stream');
    response.send(contents);
  }
}
