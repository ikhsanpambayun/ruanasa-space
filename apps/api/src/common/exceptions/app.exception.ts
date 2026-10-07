import { HttpException } from '@nestjs/common';

import type { ErrorCode } from '../constants/error-codes';

/**
 * Exception bisnis dengan `error_code` sesuai API Spec v1.6 Section 22.
 * Dilempar service; diformat menjadi `{ success: false, message, error_code, errors }` oleh filter.
 */
export class AppException extends HttpException {
  /**
   * @param status - HTTP status code.
   * @param errorCode - Kode error dari ERROR_CODES.
   * @param message - Pesan user-facing (Bahasa Indonesia).
   * @param errors - Error per-field (opsional).
   */
  constructor(
    status: number,
    errorCode: ErrorCode,
    message: string,
    errors?: Record<string, string[]>,
  ) {
    super({ message, error_code: errorCode, errors }, status);
  }
}
