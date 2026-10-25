import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import {
  errorCodeSchema,
  errorResponseSchema,
  type ErrorCode,
} from '@libs/shared';

const statusToCode: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'INVALID_STATE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'INCOMPLETE',
};

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const exceptionRecord =
      typeof exception === 'object' && exception !== null
        ? (exception as Record<string, unknown>)
        : undefined;
    const fileTooLarge =
      exceptionRecord?.code === 'LIMIT_FILE_SIZE' ||
      (exception instanceof HttpException &&
        exception.getStatus() === HttpStatus.PAYLOAD_TOO_LARGE);
    const status = fileTooLarge
      ? HttpStatus.BAD_REQUEST
      : exception instanceof HttpException
        ? exception.getStatus()
        : exception instanceof ZodError
          ? HttpStatus.BAD_REQUEST
          : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const payloadRecord =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)
        : undefined;
    const code = fileTooLarge
      ? 'VALIDATION_FAILED'
      : typeof payloadRecord?.code === 'string'
        ? payloadRecord.code
        : status === HttpStatus.BAD_REQUEST
          ? 'VALIDATION_FAILED'
          : (statusToCode[status] ?? 'VALIDATION_FAILED');
    const normalizedCode = errorCodeSchema.safeParse(code).success
      ? (code as ErrorCode)
      : 'VALIDATION_FAILED';
    const message = fileTooLarge
      ? '照片不得超过 10 MB。'
      : typeof payloadRecord?.message === 'string'
        ? payloadRecord.message
        : exception instanceof ZodError
          ? '请求参数不符合契约。'
          : status >= 500
            ? '请求无法处理。'
            : exception instanceof Error
              ? exception.message
              : '请求无法处理。';
    const body = errorResponseSchema.parse({ code: normalizedCode, message });
    response.status(status).json(body);
  }
}
