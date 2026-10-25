import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import { getJwtSecret } from './auth.js';

@Controller()
export class StorageController {
  @Get('storage/*key')
  async getFile(
    @Param('key') key: string | string[],
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const storageDir = path.resolve(
      process.env.STORAGE_DIR ?? path.resolve('.storage'),
    );
    const storageRoot = await realpath(storageDir).catch(() => storageDir);
    let storageKey: string;
    try {
      storageKey = decodeURIComponent(Array.isArray(key) ? key.join('/') : key);
    } catch {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '照片路径无效。',
      });
    }
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

    const expiresAt = Number(request.query.expires);
    const signature = request.query.signature;
    if (
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= Date.now() ||
      typeof signature !== 'string'
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '照片链接无效或已过期。',
      });
    }
    const expected = createHmac('sha256', getJwtSecret())
      .update(`${storageKey}.${expiresAt}`)
      .digest('hex');
    const provided = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      provided.length !== expectedBuffer.length ||
      !timingSafeEqual(provided, expectedBuffer)
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '照片链接无效或已过期。',
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
