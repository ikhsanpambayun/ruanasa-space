import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { extractToken } from './auth-token.util';
import { SKIP_SESSION_REFRESH_KEY } from './auth.constants';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Controller('auth')
export class AuthController {
  /**
   * @param auth - Logika autentikasi.
   * @param tokens - Pengelola token dan cookie.
   */
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * POST /auth/logout: menonaktifkan token saat ini dan menghapus cookie sesi.
   * Membutuhkan token valid (endpoint tidak publik).
   *
   * @param req - Request (untuk membaca token yang dipakai).
   * @param res - Response (untuk menghapus cookie).
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Logout berhasil')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): void {
    const token = extractToken(req);
    if (token) {
      this.auth.logout(token);
    }
    this.tokens.clearSessionCookie(res);
    (res.locals as Record<string, unknown>)[SKIP_SESSION_REFRESH_KEY] = true;
  }
}
