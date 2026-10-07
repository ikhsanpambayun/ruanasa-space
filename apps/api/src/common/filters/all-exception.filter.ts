import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { buildInternalErrorBody } from './error-response.util';

/**
 * Filter catch-all untuk error tak terduga. Detail error hanya masuk log, tidak dikirim ke client.
 * Harus didaftarkan SEBELUM HttpExceptionFilter agar filter yang lebih spesifik diprioritaskan.
 */
@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);

  /**
   * @param exception - Error apa pun yang tidak tertangani.
   * @param host - Konteks eksekusi.
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const detail =
      exception instanceof Error ? exception.stack : String(exception);
    this.logger.error(
      `Unhandled exception on ${request.method} ${request.url}`,
      detail,
    );

    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(buildInternalErrorBody());
  }
}
