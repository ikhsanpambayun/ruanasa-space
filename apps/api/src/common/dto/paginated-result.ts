/**
 * Metadata pagination standar (API Spec v1.6 Section 2.2, tanpa total_pages).
 */
export interface PaginationMeta {
  page: number;
  per_page: number;
  total_items: number;
}

/**
 * Pembungkus hasil list berpagination. Controller me-return instance ini agar
 * TransformInterceptor menaruh `pagination` di level atas response.
 */
export class PaginatedResult<T> {
  constructor(
    readonly items: T[],
    readonly pagination: PaginationMeta,
  ) {}
}
