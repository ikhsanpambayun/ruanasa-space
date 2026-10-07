import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { buildErrorBody } from './error-response.util';

/**
 * Filter global untuk HttpException. Mengubahnya menjadi format error standar API.
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter<HttpException> {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  /**
   * @param exception - Exception HTTP yang dilempar.
   * @param host - Konteks eksekusi.
   */
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}: ${exception.message}`,
        exception.stack,
      );
    }

    response
      .status(status)
      .json(buildErrorBody(status, exception.getResponse()));
  }
}
