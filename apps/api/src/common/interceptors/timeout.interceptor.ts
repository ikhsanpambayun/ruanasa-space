import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import {
  Observable,
  TimeoutError,
  catchError,
  throwError,
  timeout,
} from 'rxjs';

import { ERROR_CODES } from '../constants/error-codes';
import { AppException } from '../exceptions/app.exception';

/**
 * Batas waktu request default (30 detik, DTBD P0-INF-003).
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Menggagalkan request yang melewati batas waktu dengan HTTP 408.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  /**
   * @param timeoutMs - Batas waktu dalam milidetik.
   */
  constructor(
    private readonly timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  /**
   * @param _context - Konteks eksekusi (tidak dipakai).
   * @param next - Handler berikutnya.
   * @returns Stream yang error bila melewati batas waktu.
   */
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((error: unknown) =>
        error instanceof TimeoutError
          ? throwError(
              () =>
                new AppException(
                  HttpStatus.REQUEST_TIMEOUT,
                  ERROR_CODES.INTERNAL_ERROR,
                  'Permintaan melebihi batas waktu. Silakan coba lagi.',
                ),
            )
          : throwError(() => error),
      ),
    );
  }
}
