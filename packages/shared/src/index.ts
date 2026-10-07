/**
 * Package identifier, used to verify that @ruanasa/shared is importable from both apps.
 */
export const SHARED_PACKAGE_NAME = '@ruanasa/shared';

/**
 * Standard API success response envelope (API Spec v1.6 Section 2.2).
 */
export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

/**
 * Standard API error response envelope (API Spec v1.6 Section 2.2).
 */
export interface ApiErrorResponse {
  success: false;
  message: string;
  error_code: string;
  errors?: Record<string, string[]>;
}
