/**
 * Batas rate limit per tipe endpoint (TAD v1.6 Section 8.7). `ttl` dalam milidetik.
 * Batas "general" diterapkan global oleh ThrottlerModule; sisanya dipasang per route
 * lewat dekorator di `common/decorators/rate-limit.decorator.ts`.
 * Limit per user (registration, upload) membutuhkan tracker khusus dan ditambahkan
 * saat modul terkait dikerjakan; sementara memakai tracker IP bawaan.
 */
export const RATE_LIMITS = {
  GENERAL: { limit: 100, ttl: 60_000 },
  AUTH: { limit: 10, ttl: 60_000 },
  OTP_REQUEST: { limit: 3, ttl: 15 * 60_000 },
  PUBLIC_EVENT_LIST: { limit: 60, ttl: 60_000 },
  REGISTRATION: { limit: 5, ttl: 60_000 },
  WEBHOOK: { limit: 50, ttl: 60_000 },
  UPLOAD: { limit: 10, ttl: 60_000 },
  AUTO_CREATE: { limit: 5, ttl: 60_000 },
  /** Validasi kode promo: dibatasi agar kode tidak bisa ditebak dengan brute force. */
  PROMO_VALIDATE: { limit: 20, ttl: 60_000 },
} as const;
