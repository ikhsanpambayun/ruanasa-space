import { HttpStatus, Injectable } from '@nestjs/common';
import type { ActiveStatus, DiscountCode, DiscountType } from '@prisma/client';

import {
  ERROR_CODES,
  type ErrorCode,
} from '../../common/constants/error-codes';
import { PaginatedResult } from '../../common/dto/paginated-result';
import {
  buildPagination,
  toPageWindow,
} from '../../common/dto/pagination-query.dto';
import { AppException } from '../../common/exceptions/app.exception';
import {
  formatDateOnly,
  parseDateOnly,
  todayInWib,
} from '../../common/utils/date.util';
import type {
  CreateDiscountCodeDto,
  ListDiscountCodesQueryDto,
  UpdateDiscountCodeDto,
} from './dto/discount.dto';
import {
  DiscountCodeTakenError,
  DiscountsRepository,
} from './discounts.repository';

/** Representasi kode promo pada response admin (API Spec v1.6 Section 12.1). */
export interface DiscountCodeResponse {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  quota: number;
  used_count: number;
  expiry_date: string | null;
  status: ActiveStatus;
}

/** Hasil validasi kode promo oleh peserta (API Spec v1.6 Section 12.4). */
export interface ValidatedPromoResponse {
  discount_code_id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
}

const MAX_PERCENTAGE = 100;

/**
 * Logika bisnis kode promo.
 */
@Injectable()
export class DiscountsService {
  /**
   * @param repository - Repository kode promo.
   */
  constructor(private readonly repository: DiscountsRepository) {}

  /**
   * @param query - Filter status dan pagination.
   * @returns Halaman kode promo beserta metadata pagination.
   */
  async list(
    query: ListDiscountCodesQueryDto,
  ): Promise<PaginatedResult<DiscountCodeResponse>> {
    const { rows, total } = await this.repository.findMany({
      status: query.status,
      ...toPageWindow(query),
    });
    return new PaginatedResult(
      rows.map(toResponse),
      buildPagination(query, total),
    );
  }

  /**
   * Membuat kode promo. Kode disimpan huruf besar; persentase maksimal 100;
   * tanggal kedaluwarsa harus setelah hari ini (WIB).
   *
   * @param dto - Data kode promo.
   * @returns Kode promo yang dibuat.
   * @throws AppException 422 untuk nilai tidak valid; 409 PROMO_CODE_EXISTS bila kode sudah ada.
   */
  async create(dto: CreateDiscountCodeDto): Promise<DiscountCodeResponse> {
    this.assertRules(dto.discount_type, dto.discount_value);
    if (dto.expiry_date <= todayInWib()) {
      throw this.invalid({
        expiry_date: ['Tanggal kedaluwarsa harus di masa depan'],
      });
    }
    if (await this.repository.findByCode(dto.code)) {
      throw this.codeExists();
    }
    try {
      const created = await this.repository.create({
        code: dto.code,
        discountType: dto.discount_type,
        discountValue: dto.discount_value,
        quota: dto.quota,
        expiryDate: parseDateOnly(dto.expiry_date),
        status: dto.status ?? 'active',
      });
      return toResponse(created);
    } catch (error) {
      throw error instanceof DiscountCodeTakenError ? this.codeExists() : error;
    }
  }

  /**
   * Memperbarui aturan kode promo. Kode tidak dapat diubah; kuota tidak boleh di bawah jumlah pemakaian
   * (constraint database); tanggal kedaluwarsa boleh tanggal lampau agar kode yang sudah kedaluwarsa
   * tetap dapat dinonaktifkan; status yang tidak dikirim dipertahankan.
   *
   * @param id - UUID kode promo.
   * @param dto - Nilai baru.
   * @returns Kode promo setelah diperbarui.
   * @throws AppException 404 bila tidak ada; 422 untuk nilai tidak valid.
   */
  async update(
    id: string,
    dto: UpdateDiscountCodeDto,
  ): Promise<DiscountCodeResponse> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Kode promo tidak ditemukan',
      );
    }
    this.assertRules(dto.discount_type, dto.discount_value);
    if (dto.quota < existing.usedCount) {
      throw this.invalid({
        quota: [
          `Kuota tidak boleh kurang dari jumlah pemakaian (${existing.usedCount})`,
        ],
      });
    }
    const updated = await this.repository.update(id, {
      discountType: dto.discount_type,
      discountValue: dto.discount_value,
      quota: dto.quota,
      expiryDate: parseDateOnly(dto.expiry_date),
      status: dto.status ?? existing.status,
    });
    return toResponse(updated);
  }

  /**
   * Memvalidasi kode promo untuk peserta. Urutan pemeriksaan: ada, aktif, belum kedaluwarsa, kuota tersisa.
   * Kode berlaku sampai akhir tanggal kedaluwarsa (WIB).
   *
   * @param code - Kode dari peserta (sudah huruf besar).
   * @returns Data diskon yang dapat diterapkan.
   * @throws AppException 400 INVALID_PROMO / PROMO_INACTIVE / PROMO_EXPIRED / PROMO_QUOTA_EXHAUSTED.
   */
  async validate(code: string): Promise<ValidatedPromoResponse> {
    const found = await this.repository.findByCode(code);
    if (!found) {
      throw this.rejected(ERROR_CODES.INVALID_PROMO, 'Kode promo tidak valid');
    }
    if (found.status !== 'active') {
      throw this.rejected(ERROR_CODES.PROMO_INACTIVE, 'Kode promo tidak aktif');
    }
    if (found.expiryDate.toISOString().slice(0, 10) < todayInWib()) {
      throw this.rejected(
        ERROR_CODES.PROMO_EXPIRED,
        'Kode promo sudah expired',
      );
    }
    if (found.usedCount >= found.quota) {
      throw this.rejected(
        ERROR_CODES.PROMO_QUOTA_EXHAUSTED,
        'Kode promo sudah habis',
      );
    }
    return {
      discount_code_id: found.id,
      code: found.code,
      discount_type: found.discountType,
      discount_value: found.discountValue,
    };
  }

  private assertRules(type: DiscountType, value: number): void {
    if (type === 'percentage' && value > MAX_PERCENTAGE) {
      throw this.invalid({
        discount_value: [`Persentase diskon maksimal ${MAX_PERCENTAGE}`],
      });
    }
  }

  private invalid(errors: Record<string, string[]>): AppException {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ERROR_CODES.VALIDATION_ERROR,
      'Input tidak valid',
      errors,
    );
  }

  private codeExists(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      ERROR_CODES.PROMO_CODE_EXISTS,
      'Kode promo ini sudah digunakan',
    );
  }

  private rejected(code: ErrorCode, message: string): AppException {
    return new AppException(HttpStatus.BAD_REQUEST, code, message);
  }
}

/**
 * Memetakan baris database ke response admin.
 *
 * @param row - Baris discount_codes.
 * @returns Objek response (snake_case, tanggal YYYY-MM-DD).
 */
function toResponse(row: DiscountCode): DiscountCodeResponse {
  return {
    id: row.id,
    code: row.code,
    discount_type: row.discountType,
    discount_value: row.discountValue,
    quota: row.quota,
    used_count: row.usedCount,
    expiry_date: formatDateOnly(row.expiryDate),
    status: row.status,
  };
}
