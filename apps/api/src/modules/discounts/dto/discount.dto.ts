import type { ActiveStatus, DiscountType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  DateOnlyField,
  trimIfString,
} from '../../../common/validators/common-fields.decorators';

const DISCOUNT_TYPES: DiscountType[] = ['percentage', 'fixed_amount'];
const ACTIVE_STATUSES: ActiveStatus[] = ['active', 'inactive'];
const MAX_INT = 2_147_483_647;

/**
 * Mengubah string menjadi huruf besar setelah di-trim (kode promo tidak membedakan huruf besar/kecil).
 *
 * @param value - Nilai mentah.
 * @returns String huruf besar, atau nilai asli bila bukan string.
 */
function toUpperTrimmed(value: unknown): unknown {
  const trimmed = trimIfString(value);
  return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
}

/**
 * Field yang dapat diubah pada kode promo (dipakai bersama oleh create dan update).
 */
class DiscountRulesDto {
  @IsIn(DISCOUNT_TYPES, {
    message: 'Tipe diskon harus percentage atau fixed_amount',
  })
  discount_type!: DiscountType;

  @IsInt({ message: 'Nilai diskon harus berupa angka bulat' })
  @Min(1, { message: 'Nilai diskon minimal 1' })
  @Max(MAX_INT, { message: 'Nilai diskon terlalu besar' })
  discount_value!: number;

  @IsInt({ message: 'Kuota harus berupa angka bulat' })
  @Min(1, { message: 'Kuota minimal 1' })
  @Max(MAX_INT, { message: 'Kuota terlalu besar' })
  quota!: number;

  @DateOnlyField()
  expiry_date!: string;

  @IsOptional()
  @IsIn(ACTIVE_STATUSES, { message: 'Status harus active atau inactive' })
  status?: ActiveStatus;
}

/**
 * Body create kode promo (API Spec v1.6 Section 12.2).
 */
export class CreateDiscountCodeDto extends DiscountRulesDto {
  @Transform(({ value }: { value: unknown }) => toUpperTrimmed(value))
  @IsString({ message: 'Kode promo wajib diisi' })
  @IsNotEmpty({ message: 'Kode promo wajib diisi' })
  @MaxLength(20, { message: 'Kode promo maksimal 20 karakter' })
  @Matches(/^[A-Z0-9]*$/, {
    message: 'Kode promo hanya boleh berisi huruf dan angka',
  })
  code!: string;
}

/**
 * Body update kode promo. Kode tidak dapat diubah; `status` yang tidak dikirim dipertahankan.
 */
export class UpdateDiscountCodeDto extends DiscountRulesDto {}

/**
 * Query daftar kode promo: `?status=active&page=1&per_page=20`.
 */
export class ListDiscountCodesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ACTIVE_STATUSES, { message: 'Status harus active atau inactive' })
  status?: ActiveStatus;
}

/**
 * Body validasi kode promo oleh peserta (API Spec v1.6 Section 12.4).
 * Panjang tidak dibatasi ketat: kode yang tidak mungkin ada dijawab INVALID_PROMO, bukan 422.
 */
export class ValidatePromoDto {
  @Transform(({ value }: { value: unknown }) => toUpperTrimmed(value))
  @IsString({ message: 'Kode promo wajib diisi' })
  @IsNotEmpty({ message: 'Kode promo wajib diisi' })
  @MaxLength(100, { message: 'Kode promo tidak valid' })
  code!: string;
}
