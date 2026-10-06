import 'reflect-metadata';
import { APP_NAME } from '@libs/shared';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT 必须是 1 到 65535 之间的整数。');
  }
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(port, '127.0.0.1');
  Logger.log(`${APP_NAME} API: http://127.0.0.1:${port}`, 'Bootstrap');
}

bootstrap().catch(() => {
  Logger.error('API 启动失败，请检查本地端口与配置。', 'Bootstrap');
  process.exitCode = 1;
});
