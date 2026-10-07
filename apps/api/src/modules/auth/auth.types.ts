import type { UserRole } from '@prisma/client';
import type { Request } from 'express';

/**
 * Payload JWT akses (TAD v1.6 Section 4.10): `{ sub, role, iat, exp }`.
 */
export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  iat: number;
  exp: number;
}

/**
 * User yang sudah terautentikasi, tersedia lewat `@CurrentUser()`.
 */
export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

/**
 * Request Express setelah melewati JwtAuthGuard.
 */
export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

/**
 * Tujuan temp_token. Token dengan tujuan berbeda tidak dapat saling dipakai.
 */
export type TempTokenPurpose =
  'google_complete' | 'email_complete' | 'whatsapp_complete';

/**
 * Klaim tambahan di temp_token (data yang sudah terverifikasi pada langkah sebelumnya).
 */
export interface TempTokenClaims {
  email?: string;
  phone_number?: string;
  name?: string;
  picture?: string;
}

/**
 * Payload temp_token. Tidak memiliki `sub`/`role` sehingga tidak dapat dipakai sebagai token akses.
 */
export interface TempTokenPayload extends TempTokenClaims {
  purpose: TempTokenPurpose;
  jti: string;
  iat: number;
  exp: number;
}

/**
 * Token akses yang baru diterbitkan beserta waktu kedaluwarsanya (epoch detik).
 */
export interface IssuedToken {
  token: string;
  expiresAt: number;
}
