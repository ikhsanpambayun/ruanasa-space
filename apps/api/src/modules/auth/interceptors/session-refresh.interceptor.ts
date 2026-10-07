import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, tap } from 'rxjs';

import {
  REFRESHED_TOKEN_HEADER,
  SKIP_SESSION_REFRESH_KEY,
} from '../auth.constants';
import type { AuthenticatedRequest } from '../auth.types';
import { TokenService } from '../token.service';

/**
 * Sliding window: setiap request terautentikasi yang berhasil memperpanjang sesi 7 hari.
 * Token baru dikirim lewat cookie httpOnly dan header `X-Refreshed-Token` (untuk client Bearer).
 * Dilewati bila handler menandai `res.locals.skipSessionRefresh` (logout).
 */
@Injectable()
export class SessionRefreshInterceptor implements NestInterceptor {
  /**
   * @param tokens - Penerbit token.
   */
  constructor(private readonly tokens: TokenService) {}

  /**
   * @param context - Konteks eksekusi.
   * @param next - Handler berikutnya.
   * @returns Stream yang sama, dengan efek samping menulis token baru ke response.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      tap(() => {
        const skip =
          (response.locals as Record<string, unknown>)[
            SKIP_SESSION_REFRESH_KEY
          ] === true;
        if (!request.user || skip || response.headersSent) {
          return;
        }
        const issued = this.tokens.signAccessToken(request.user);
        this.tokens.setSessionCookie(response, issued);
        response.setHeader(REFRESHED_TOKEN_HEADER, issued.token);
      }),
    );
  }
}
