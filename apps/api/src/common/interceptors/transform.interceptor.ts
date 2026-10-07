import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';

import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { PaginatedResult, type PaginationMeta } from '../dto/paginated-result';

/**
 * Bentuk response sukses standar (API Spec v1.6 Section 2.2).
 */
export interface SuccessBody<T> {
  success: true;
  message: string;
  data: T;
  pagination?: PaginationMeta;
}

const DEFAULT_SUCCESS_MESSAGE = 'Success';

/**
 * Membungkus return value controller menjadi `{ success, message, data }`.
 * Hasil `PaginatedResult` menghasilkan `pagination` di level atas. Pesan dapat diatur lewat @ResponseMessage.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  SuccessBody<T | T[] | null>
> {
  /**
   * @param reflector - Untuk membaca metadata @ResponseMessage.
   */
  constructor(private readonly reflector: Reflector) {}

  /**
   * @param context - Konteks eksekusi.
   * @param next - Handler berikutnya.
   * @returns Stream response yang sudah dibungkus.
   */
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessBody<T | T[] | null>> {
    const message =
      this.reflector.get<string | undefined>(
        RESPONSE_MESSAGE_KEY,
        context.getHandler(),
      ) ?? DEFAULT_SUCCESS_MESSAGE;

    return next.handle().pipe(
      map((result): SuccessBody<T | T[] | null> => {
        if (result instanceof PaginatedResult) {
          return {
            success: true,
            message,
            data: result.items as T[],
            pagination: result.pagination,
          };
        }
        return { success: true, message, data: result ?? null };
      }),
    );
  }
}
