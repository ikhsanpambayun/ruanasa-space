import type { Request } from 'express';

import { SESSION_COOKIE_NAME } from './auth.constants';

const BEARER_PREFIX = 'Bearer ';

/**
 * Mengambil JWT dari request. Cookie diperiksa lebih dulu; bila tidak ada, dipakai header
 * `Authorization: Bearer` sebagai fallback (API Spec v1.6 Section 2.3).
 *
 * @param req - Request Express.
 * @returns Token, atau null bila tidak ada.
 */
export function extractToken(req: Request): string | null {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const fromCookie = cookies?.[SESSION_COOKIE_NAME];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }

  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith(BEARER_PREFIX)) {
    const token = header.slice(BEARER_PREFIX.length).trim();
    return token.length > 0 ? token : null;
  }
  return null;
}
