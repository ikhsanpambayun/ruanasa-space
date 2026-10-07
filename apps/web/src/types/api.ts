export type { ApiErrorResponse, ApiSuccessResponse } from '@ruanasa/shared';

/**
 * Metadata pagination standar API (tanpa total_pages, sesuai API Spec v1.6).
 */
export interface Pagination {
  page: number;
  per_page: number;
  total_items: number;
}
