import {
  BadRequestException,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';

import { ERROR_CODES } from '../constants/error-codes';

/**
 * Meratakan ValidationError (termasuk nested) menjadi map `field -> pesan[]`.
 *
 * @param errors - Hasil validasi class-validator.
 * @param parentPath - Prefix path untuk field nested.
 * @returns Map error per-field; field nested memakai notasi titik.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    if (error.constraints) {
      result[path] = Object.values(error.constraints);
    }
    if (error.children && error.children.length > 0) {
      Object.assign(result, flattenValidationErrors(error.children, path));
    }
  }

  return result;
}

/**
 * Membuat ValidationPipe global: whitelist DTO, tolak field tak dikenal, transform tipe,
 * dan format error `VALIDATION_ERROR` sesuai API Spec v1.6.
 *
 * @returns Instance ValidationPipe.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) =>
      new BadRequestException({
        message: 'Input tidak valid',
        error_code: ERROR_CODES.VALIDATION_ERROR,
        errors: flattenValidationErrors(errors),
      }),
  });
}
