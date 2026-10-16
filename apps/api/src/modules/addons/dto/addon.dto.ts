import type { ActiveStatus } from '@prisma/client';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  OptionalText,
  RequiredText,
} from '../../../common/validators/common-fields.decorators';

const MAX_INT = 2_147_483_647;

/**
 * Body create dan update add-on (API Spec v1.6 Sections 11.2-11.3). PUT mengganti seluruh data:
 * `description` yang tidak dikirim menjadi null, sedangkan `status` yang tidak dikirim dipertahankan.
 */
export class AddonBodyDto {
  @RequiredText('Nama add-on', 100)
  name!: string;

  @OptionalText('Deskripsi', 500)
  description?: string | null;

  @IsInt({ message: 'Harga harus berupa angka bulat (Rupiah)' })
  @Min(0, { message: 'Harga minimal 0' })
  @Max(MAX_INT, { message: 'Harga terlalu besar' })
  price!: number;

  @IsInt({ message: 'Jumlah tersedia harus berupa angka bulat' })
  @Min(0, { message: 'Jumlah tersedia minimal 0' })
  @Max(MAX_INT, { message: 'Jumlah tersedia terlalu besar' })
  available_quantity!: number;

  @IsInt({ message: 'Maksimal pembelian harus berupa angka bulat' })
  @Min(1, { message: 'Maksimal pembelian minimal 1' })
  @Max(MAX_INT, { message: 'Maksimal pembelian terlalu besar' })
  max_purchase_quantity!: number;

  @IsOptional()
  @IsIn(['active', 'inactive'], {
    message: 'Status harus active atau inactive',
  })
  status?: ActiveStatus;
}
