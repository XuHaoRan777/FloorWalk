import 'reflect-metadata';
import { APP_NAME } from '@libs/shared';
import { Logger } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';
import { getJwtSecret } from './auth-config.js';
import { getAllowedOrigins } from './cors-config.js';
import { HttpErrorFilter } from './http-exception.filter.js';

const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function bootstrap() {
  getJwtSecret();
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT 必须是 1 到 65535 之间的整数。');
  }
  const configuredHost = process.env.HOST;
  const isLocalDevelopment =
    process.env.NODE_ENV === 'development' && !process.env.FW_SLOT;
  const host =
    isLocalDevelopment &&
    (!configuredHost || ['127.0.0.1', 'localhost'].includes(configuredHost))
      ? '0.0.0.0'
      : (configuredHost ?? '127.0.0.1');
  if (host.length === 0) {
    throw new Error('HOST 不能为空。');
  }
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = getAllowedOrigins();
  const corsOptions: CorsOptions = {
    origin: (
      origin: string | undefined,
      callback: (
        error: Error | null,
        allow?: boolean | string | RegExp | (string | RegExp)[],
      ) => void,
    ) => callback(null, origin === undefined || allowedOrigins.has(origin)),
    credentials: true,
  };
  app.enableCors(corsOptions);
  app.use((request: Request, response: Response, next: NextFunction) => {
    const origin = request.headers.origin;
    const requestedMethod = request.headers['access-control-request-method'];
    if (
      (writeMethods.has(request.method) ||
        (request.method === 'OPTIONS' &&
          requestedMethod !== undefined &&
          writeMethods.has(requestedMethod))) &&
      origin !== undefined &&
      !allowedOrigins.has(origin)
    ) {
      response.status(403).json({
        code: 'FORBIDDEN',
        message: '请求来源不在允许列表中。',
      });
      return;
    }
    next();
  });
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  await app.listen(port, host);
  Logger.log(`${APP_NAME} API: http://${host}:${port}`, 'Bootstrap');
}

bootstrap().catch(() => {
  Logger.error('API 启动失败，请检查本地端口与配置。', 'Bootstrap');
  process.exitCode = 1;
});
