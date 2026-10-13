import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

import type { PaginationMeta } from './paginated-result';

/** Jumlah item per halaman bila tidak ditentukan (API Spec v1.6 Section 2.5). */
export const DEFAULT_PER_PAGE = 20;
/** Batas atas per_page agar satu request tidak mengambil data tanpa batas. */
export const MAX_PER_PAGE = 100;

/**
 * Query pagination standar: `?page=1&per_page=20`.
 */
export class PaginationQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'page harus berupa angka bulat' })
  @Min(1, { message: 'page minimal 1' })
  page: number = 1;

  @Type(() => Number)
  @IsInt({ message: 'per_page harus berupa angka bulat' })
  @Min(1, { message: 'per_page minimal 1' })
  @Max(MAX_PER_PAGE, { message: `per_page maksimal ${MAX_PER_PAGE}` })
  per_page: number = DEFAULT_PER_PAGE;
}

/**
 * Menghitung offset dan batas baris untuk query database.
 *
 * @param query - Query pagination yang sudah divalidasi.
 * @returns Nilai `skip` dan `take` untuk Prisma.
 */
export function toPageWindow(query: PaginationQueryDto): {
  skip: number;
  take: number;
} {
  return { skip: (query.page - 1) * query.per_page, take: query.per_page };
}

/**
 * Membentuk metadata pagination (tanpa total_pages, sesuai API Spec v1.6).
 *
 * @param query - Query pagination.
 * @param totalItems - Jumlah seluruh item.
 * @returns Objek pagination untuk response.
 */
export function buildPagination(
  query: PaginationQueryDto,
  totalItems: number,
): PaginationMeta {
  return {
    page: query.page,
    per_page: query.per_page,
    total_items: totalItems,
  };
}
