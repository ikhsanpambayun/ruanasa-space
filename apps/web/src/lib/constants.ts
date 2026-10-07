/**
 * Base URL REST API backend (env NEXT_PUBLIC_API_URL, TAD v1.6 Section 21).
 */
export const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/**
 * Timezone tampilan aplikasi. Data disimpan UTC, ditampilkan WIB.
 */
export const APP_TIMEZONE = 'Asia/Jakarta';

/**
 * Rute halaman login (tujuan redirect saat 401).
 */
export const LOGIN_ROUTE = '/login';
