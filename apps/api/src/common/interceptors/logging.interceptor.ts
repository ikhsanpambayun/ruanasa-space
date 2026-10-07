import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Mencatat method, route, status, dan durasi setiap request.
 * Body, query string, dan nilai path param tidak dicatat (menghindari kebocoran token/PII);
 * yang dicatat adalah pola route, misalnya `/api/v1/feedback/:token`.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  /**
   * @param context - Konteks eksekusi.
   * @param next - Handler berikutnya.
   * @returns Stream yang sama dengan efek samping logging.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    const route =
      (request.route as { path?: string } | undefined)?.path ?? request.path;

    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log(
            `${request.method} ${route} ${response.statusCode} ${Date.now() - startedAt}ms`,
          ),
        error: () =>
          this.logger.warn(
            `${request.method} ${route} failed after ${Date.now() - startedAt}ms`,
          ),
      }),
    );
  }
}
