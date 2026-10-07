import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Request, Response } from 'express';

import { Public } from '../../common/decorators/public.decorator';
import {
  AuthRateLimit,
  AutoCreateRateLimit,
} from '../../common/decorators/rate-limit.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { extractToken } from './auth-token.util';
import { SKIP_SESSION_REFRESH_KEY } from './auth.constants';
import {
  toAdminUserResponse,
  toUserResponse,
  type AdminUserResponse,
  type ParticipantSessionResponse,
  type SessionResponse,
} from './auth.responses';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AutoCreateDto } from './dto/auto-create.dto';
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
   * POST /auth/admin/login: login admin dengan email dan password.
   *
   * @param dto - Email dan password.
   * @param res - Response (untuk menulis cookie sesi).
   * @returns Token dan data admin.
   */
  @Public()
  @AuthRateLimit()
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Login berhasil')
  async adminLogin(
    @Body() dto: AdminLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse<AdminUserResponse>> {
    const user = await this.auth.adminLogin(dto.email, dto.password);
    const token = this.startSession(res, user);
    return { token, user: toAdminUserResponse(user) };
  }

  /**
   * POST /auth/auto-create: membuat akun otomatis (continue without login).
   *
   * @param dto - Nama, nomor telepon, dan email.
   * @param res - Response (untuk menulis cookie sesi).
   * @returns Token dan data user baru.
   */
  @Public()
  @AutoCreateRateLimit()
  @Post('auto-create')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Akun berhasil dibuat')
  async autoCreate(
    @Body() dto: AutoCreateDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ParticipantSessionResponse> {
    const user = await this.auth.autoCreate(
      dto.name,
      dto.phone_number,
      dto.email,
    );
    const token = this.startSession(res, user);
    return { token, user: toUserResponse(user), is_new_user: true };
  }

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

  /**
   * Menerbitkan token akses, menulis cookie sesi, dan mengembalikan token untuk body response.
   *
   * @param res - Response Express.
   * @param user - User yang berhasil login.
   * @returns JWT akses.
   */
  private startSession(res: Response, user: User): string {
    const issued = this.auth.issueSession(user);
    this.tokens.setSessionCookie(res, issued);
    return issued.token;
  }
}
