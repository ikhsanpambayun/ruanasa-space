import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { CANONICAL_PHONE_PATTERN, normalizePhone } from '../utils/phone.util';

/**
 * Mengubah nilai string menjadi hasil trim; nilai non-string dibiarkan agar ditolak validator.
 *
 * @param value - Nilai mentah dari request.
 * @returns String ter-trim atau nilai asli.
 */
function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Field nama: wajib, maksimal 100 karakter, di-trim.
 */
export function NameField(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => trimString(value)),
    IsString({ message: 'Nama wajib diisi' }),
    IsNotEmpty({ message: 'Nama wajib diisi' }),
    MaxLength(100, { message: 'Nama maksimal 100 karakter' }),
  );
}

/**
 * Field email: di-trim dan di-lowercase (email unik tanpa membedakan huruf besar/kecil), maks 255 karakter.
 */
export function EmailField(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      const trimmed = trimString(value);
      return typeof trimmed === 'string' ? trimmed.toLowerCase() : trimmed;
    }),
    IsEmail({}, { message: 'Format email tidak valid' }),
    MaxLength(255, { message: 'Email maksimal 255 karakter' }),
  );
}

/**
 * Field nomor telepon seluler Indonesia: dinormalkan ke format 08xxxxxxxxxx lalu divalidasi.
 */
export function PhoneField(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      const trimmed = trimString(value);
      return typeof trimmed === 'string' ? normalizePhone(trimmed) : trimmed;
    }),
    IsString({ message: 'Format nomor telepon tidak valid' }),
    Matches(CANONICAL_PHONE_PATTERN, {
      message: 'Format nomor telepon tidak valid',
    }),
  );
}

/**
 * Field string token wajib (temp_token, id_token, otp_session_id).
 *
 * @param label - Nama field untuk pesan error.
 */
export function RequiredTokenField(label: string): PropertyDecorator {
  return applyDecorators(
    IsString({ message: `${label} wajib diisi` }),
    IsNotEmpty({ message: `${label} wajib diisi` }),
    MaxLength(4096, { message: `${label} tidak valid` }),
  );
}
