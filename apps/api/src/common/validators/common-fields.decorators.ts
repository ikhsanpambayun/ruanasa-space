import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsString,
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
