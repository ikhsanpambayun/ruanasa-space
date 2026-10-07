import { HttpStatus } from '@nestjs/common';
import type { ApiErrorResponse } from '@ruanasa/shared';

import { ERROR_CODES, type ErrorCode } from '../constants/error-codes';

const DEFAULT_ERRORS: Record<
  number,
  { message: string; errorCode: ErrorCode }
> = {
  [HttpStatus.BAD_REQUEST]: {
    message: 'Input tidak valid',
    errorCode: ERROR_CODES.VALIDATION_ERROR,
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    message: 'Input tidak valid',
    errorCode: ERROR_CODES.VALIDATION_ERROR,
  },
  [HttpStatus.UNAUTHORIZED]: {
    message: 'Token tidak valid atau expired',
    errorCode: ERROR_CODES.UNAUTHORIZED,
  },
  [HttpStatus.FORBIDDEN]: {
    message: 'Tidak memiliki akses',
    errorCode: ERROR_CODES.FORBIDDEN,
  },
  [HttpStatus.NOT_FOUND]: {
    message: 'Sumber daya tidak ditemukan',
    errorCode: ERROR_CODES.NOT_FOUND,
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    message: 'Terlalu banyak request. Coba lagi beberapa saat.',
    errorCode: ERROR_CODES.RATE_LIMITED,
  },
};

const INTERNAL_ERROR: { message: string; errorCode: ErrorCode } = {
  message: 'Terjadi kesalahan pada server',
  errorCode: ERROR_CODES.INTERNAL_ERROR,
};

/**
 * Memeriksa apakah nilai adalah objek biasa (bukan null/array).
 *
 * @param value - Nilai yang diperiksa.
 * @returns True jika objek biasa.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Memeriksa apakah nilai adalah map error per-field (`Record<string, string[]>`).
 *
 * @param value - Nilai yang diperiksa.
 * @returns True jika bentuknya sesuai.
 */
function isFieldErrors(value: unknown): value is Record<string, string[]> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (messages) =>
        Array.isArray(messages) && messages.every((m) => typeof m === 'string'),
    )
  );
}

/**
 * Membentuk body error standar dari status dan response bawaan HttpException.
 * Jika response membawa `error_code` (dari AppException atau validation pipe) maka dipakai apa adanya;
 * jika tidak, dipakai pesan dan kode default per status. Pesan bawaan framework (Inggris) tidak diteruskan ke user.
 *
 * @param status - HTTP status code.
 * @param payload - Hasil `exception.getResponse()`.
 * @returns Body error sesuai API Spec v1.6 Section 2.2.
 */
export function buildErrorBody(
  status: number,
  payload: string | object,
): ApiErrorResponse {
  const fallback = DEFAULT_ERRORS[status] ?? INTERNAL_ERROR;

  if (isRecord(payload) && typeof payload.error_code === 'string') {
    const body: ApiErrorResponse = {
      success: false,
      message:
        typeof payload.message === 'string'
          ? payload.message
          : fallback.message,
      error_code: payload.error_code,
    };
    if (isFieldErrors(payload.errors)) {
      body.errors = payload.errors;
    }
    return body;
  }

  return {
    success: false,
    message: fallback.message,
    error_code: fallback.errorCode,
  };
}

/**
 * Body error untuk exception yang tidak diharapkan (500).
 *
 * @returns Body error INTERNAL_ERROR.
 */
export function buildInternalErrorBody(): ApiErrorResponse {
  return {
    success: false,
    message: INTERNAL_ERROR.message,
    error_code: INTERNAL_ERROR.errorCode,
  };
}
