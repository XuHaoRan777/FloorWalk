import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

export function getCorsOrigins() {
  const configured = process.env.CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured?.length) return configured;
  return [
    'http://127.0.0.1:3019',
    'http://127.0.0.1:3020',
    'http://localhost:3019',
    'http://localhost:3020',
    ...[1, 2, 3].flatMap((slot) => [
      `http://127.0.0.1:${3100 + slot * 10 + 1}`,
      `http://127.0.0.1:${3100 + slot * 10 + 2}`,
    ]),
  ];
}

@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    if (
      request.path.startsWith('/api/') &&
      ['POST', 'PATCH', 'DELETE'].includes(request.method) &&
      origin !== undefined &&
      !getCorsOrigins().includes(origin)
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '请求来源不受信任。',
      });
    }
    return true;
  }
}
