import { HttpStatus, ParseUUIDPipe } from '@nestjs/common';

import { ERROR_CODES } from '../constants/error-codes';
import { AppException } from '../exceptions/app.exception';

/**
 * Memvalidasi parameter path berformat UUID. ID yang bukan UUID tidak mungkin ada di database,
 * sehingga dijawab 404 (bukan 500 dari Prisma) dengan pesan yang sama seperti data yang tidak ditemukan.
 */
export const ParseUuidPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new AppException(
      HttpStatus.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      'Data tidak ditemukan',
    ),
});
