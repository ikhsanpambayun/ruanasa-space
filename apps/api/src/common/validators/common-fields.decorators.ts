import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { isValidDateOnly } from '../utils/date.util';

/**
 * Mengubah string menjadi hasil trim; nilai non-string dibiarkan agar ditolak validator.
 *
 * @param value - Nilai mentah.
 * @returns String ter-trim atau nilai asli.
 */
export function trimIfString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Field string wajib berisi (setelah di-trim) dengan batas panjang.
 *
 * @param label - Nama field untuk pesan error.
 * @param max - Panjang maksimal.
 */
export function RequiredText(label: string, max: number): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => trimIfString(value)),
    IsString({ message: `${label} wajib diisi` }),
    MinLength(1, { message: `${label} wajib diisi` }),
    MaxLength(max, { message: `${label} maksimal ${max} karakter` }),
  );
}

@ValidatorConstraint({ name: 'isDateOnly', async: false })
class IsDateOnlyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidDateOnly(value);
  }

  defaultMessage(): string {
    return 'Format tanggal harus YYYY-MM-DD dan berupa tanggal yang valid';
  }
}

/**
 * Field tanggal tanpa jam berformat YYYY-MM-DD (menolak tanggal kalender yang tidak ada).
 */
export function DateOnlyField(): PropertyDecorator {
  return applyDecorators(Validate(IsDateOnlyConstraint));
}

/**
 * Field teks opsional dan boleh null: di-trim, string kosong dianggap null, dengan batas panjang.
 *
 * @param label - Nama field untuk pesan error.
 * @param max - Panjang maksimal.
 */
export function OptionalText(label: string, max: number): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      const trimmed = trimIfString(value);
      return trimmed === '' ? null : trimmed;
    }),
    IsOptional(),
    IsString({ message: `${label} harus berupa teks` }),
    MaxLength(max, { message: `${label} maksimal ${max} karakter` }),
  );
}

/**
 * Field URL (http/https) opsional dan boleh null; string kosong dianggap null.
 *
 * @param label - Nama field untuk pesan error.
 * @param max - Panjang maksimal.
 */
export function OptionalUrl(label: string, max: number): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      const trimmed = trimIfString(value);
      return trimmed === '' ? null : trimmed;
    }),
    IsOptional(),
    IsUrl(
      { protocols: ['http', 'https'], require_protocol: true },
      { message: `${label} harus berupa URL yang valid` },
    ),
    MaxLength(max, { message: `${label} maksimal ${max} karakter` }),
  );
}
