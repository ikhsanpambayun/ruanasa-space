/**
 * Nama cookie sesi (httpOnly) yang berisi JWT.
 */
export const SESSION_COOKIE_NAME = 'token';

/**
 * Header response yang membawa token baru (sliding window) untuk client yang memakai Bearer.
 */
export const REFRESHED_TOKEN_HEADER = 'X-Refreshed-Token';

/**
 * Kunci `res.locals` untuk melewati perpanjangan sesi (dipakai logout).
 */
export const SKIP_SESSION_REFRESH_KEY = 'skipSessionRefresh';

/**
 * Masa berlaku temp_token pada alur "complete registration" (15 menit).
 */
export const TEMP_TOKEN_TTL_SECONDS = 15 * 60;
