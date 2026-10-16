import type { ActiveStatus, DiscountType, PriceType } from '@prisma/client';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { DateOnlyField } from '../../../common/validators/common-fields.decorators';

const PRICE_TYPES: PriceType[] = ['normal', 'early_bird'];
const DISCOUNT_TYPES: DiscountType[] = ['percentage', 'fixed_amount'];
const ACTIVE_STATUSES: ActiveStatus[] = ['active', 'inactive'];
const MAX_INT = 2_147_483_647;
/** Batas wajar jumlah minimum peserta pada aturan bundle. */
const MAX_BUNDLE_QUANTITY = 1000;

/**
 * Body create dan update harga event (API Spec v1.6 Sections 10.2-10.3). PUT mengganti seluruh data;
 * `status` yang tidak dikirim dipertahankan. Harga normal tanpa rentang tanggal; early bird wajib memilikinya.
 */
export class PriceBodyDto {
  @IsIn(PRICE_TYPES, { message: 'Tipe harga harus normal atau early_bird' })
  price_type!: PriceType;

  @IsInt({ message: 'Harga harus berupa angka bulat (Rupiah)' })
  @Min(0, { message: 'Harga minimal 0' })
  @Max(MAX_INT, { message: 'Harga terlalu besar' })
  price!: number;

  @IsOptional()
  @DateOnlyField()
  start_date?: string | null;

  @IsOptional()
  @DateOnlyField()
  end_date?: string | null;

  @IsOptional()
  @IsIn(ACTIVE_STATUSES, { message: 'Status harus active atau inactive' })
  status?: ActiveStatus;
}

/**
 * Body create dan update aturan bundle (API Spec v1.6 Sections 10.5-10.6). Hanya tipe `bundle` yang ada di MVP.
 */
export class PricingRuleBodyDto {
  @IsOptional()
  @IsIn(['bundle'], { message: 'rule_type harus bundle' })
  rule_type?: 'bundle';

  @IsInt({ message: 'Jumlah minimum harus berupa angka bulat' })
  @Min(2, { message: 'Jumlah minimum peserta minimal 2' })
  @Max(MAX_BUNDLE_QUANTITY, {
    message: `Jumlah minimum peserta maksimal ${MAX_BUNDLE_QUANTITY}`,
  })
  minimum_quantity!: number;

  @IsIn(DISCOUNT_TYPES, {
    message: 'Tipe diskon harus percentage atau fixed_amount',
  })
  discount_type!: DiscountType;

  @IsInt({ message: 'Nilai diskon harus berupa angka bulat' })
  @Min(1, { message: 'Nilai diskon minimal 1' })
  @Max(MAX_INT, { message: 'Nilai diskon terlalu besar' })
  discount_value!: number;

  @IsOptional()
  @IsIn(ACTIVE_STATUSES, { message: 'Status harus active atau inactive' })
  status?: ActiveStatus;
}
