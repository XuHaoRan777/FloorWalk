import 'reflect-metadata';
import { APP_NAME } from '@libs/shared';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { getJwtSecret } from './auth.js';
import { HttpErrorFilter } from './http-exception.filter.js';

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
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  await app.listen(port, host);
  Logger.log(`${APP_NAME} API: http://${host}:${port}`, 'Bootstrap');
}

bootstrap().catch(() => {
  Logger.error('API 启动失败，请检查本地端口与配置。', 'Bootstrap');
  process.exitCode = 1;
});
