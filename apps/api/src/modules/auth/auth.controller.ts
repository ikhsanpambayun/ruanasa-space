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
import { ResponseWithMessage } from '../../common/dto/response-with-message';
import { extractToken } from './auth-token.util';
import { SKIP_SESSION_REFRESH_KEY } from './auth.constants';
import {
  toAdminUserResponse,
  toUserResponse,
  type AdminUserResponse,
  type ParticipantSessionResponse,
  type PendingProfileResponse,
  type SessionResponse,
  type UserResponse,
} from './auth.responses';
import {
  AuthService,
  type OtpRequestOutcome,
  type OtpVerifyResult,
} from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AutoCreateDto } from './dto/auto-create.dto';
import {
  CompleteEmailRegistrationDto,
  CompleteWhatsAppRegistrationDto,
  RequestEmailOtpDto,
  RequestWhatsAppOtpDto,
  VerifyOtpDto,
} from './dto/otp.dto';
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
   * POST /auth/email/request-otp: mengirim OTP 6 digit ke email.
   *
   * @param dto - Email tujuan.
   * @returns Id sesi OTP, masa berlaku, dan status user.
   */
  @Public()
  @AuthRateLimit()
  @Post('email/request-otp')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('OTP telah dikirim ke email')
  requestEmailOtp(@Body() dto: RequestEmailOtpDto): Promise<OtpRequestOutcome> {
    return this.auth.requestEmailOtp(dto.email);
  }

  /**
   * POST /auth/email/verify-otp: verifikasi OTP email; user lama login, user baru mendapat temp_token.
   *
   * @param dto - Id sesi OTP dan kode.
   * @param res - Response (untuk cookie sesi bila login).
   * @returns Sesi login atau data untuk melengkapi profil.
   */
  @Public()
  @AuthRateLimit()
  @Post('email/verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyEmailOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<
    ResponseWithMessage<ParticipantSessionResponse | PendingProfileResponse>
  > {
    const result = await this.auth.verifyEmailOtp(
      dto.otp_session_id,
      dto.otp_code,
    );
    return this.respondToVerification(res, result, { email: true });
  }

  /**
   * POST /auth/email/complete: melengkapi registrasi user baru dari Email OTP.
   *
   * @param dto - temp_token, nama, dan nomor telepon.
   * @param res - Response (untuk cookie sesi).
   * @returns Token dan data user baru.
   */
  @Public()
  @AuthRateLimit()
  @Post('email/complete')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Registrasi berhasil')
  async completeEmailRegistration(
    @Body() dto: CompleteEmailRegistrationDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse<UserResponse>> {
    const user = await this.auth.completeEmailRegistration(
      dto.temp_token,
      dto.name,
      dto.phone_number,
    );
    return { token: this.startSession(res, user), user: toUserResponse(user) };
  }

  /**
   * POST /auth/whatsapp/request-otp: mengirim OTP 6 digit via WhatsApp.
   *
   * @param dto - Nomor telepon tujuan.
   * @returns Id sesi OTP, masa berlaku, dan status user.
   */
  @Public()
  @AuthRateLimit()
  @Post('whatsapp/request-otp')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('OTP telah dikirim via WhatsApp')
  requestWhatsAppOtp(
    @Body() dto: RequestWhatsAppOtpDto,
  ): Promise<OtpRequestOutcome> {
    return this.auth.requestWhatsAppOtp(dto.phone_number);
  }

  /**
   * POST /auth/whatsapp/verify-otp: verifikasi OTP WhatsApp; user lama login, user baru mendapat temp_token.
   *
   * @param dto - Id sesi OTP dan kode.
   * @param res - Response (untuk cookie sesi bila login).
   * @returns Sesi login atau data untuk melengkapi profil.
   */
  @Public()
  @AuthRateLimit()
  @Post('whatsapp/verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyWhatsAppOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<
    ResponseWithMessage<ParticipantSessionResponse | PendingProfileResponse>
  > {
    const result = await this.auth.verifyWhatsAppOtp(
      dto.otp_session_id,
      dto.otp_code,
    );
    return this.respondToVerification(res, result, { email: false });
  }

  /**
   * POST /auth/whatsapp/complete: melengkapi registrasi user baru dari WhatsApp OTP.
   *
   * @param dto - temp_token, nama, dan email.
   * @param res - Response (untuk cookie sesi).
   * @returns Token dan data user baru.
   */
  @Public()
  @AuthRateLimit()
  @Post('whatsapp/complete')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Registrasi berhasil')
  async completeWhatsAppRegistration(
    @Body() dto: CompleteWhatsAppRegistrationDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse<UserResponse>> {
    const user = await this.auth.completeWhatsAppRegistration(
      dto.temp_token,
      dto.name,
      dto.email,
    );
    return { token: this.startSession(res, user), user: toUserResponse(user) };
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
   * Membentuk response verifikasi OTP: login untuk user lama, atau temp_token untuk user baru.
   *
   * @param res - Response Express.
   * @param result - Hasil verifikasi dari AuthService.
   * @param options - `email: true` untuk alur email (mengembalikan `email`), `false` untuk WhatsApp (`phone_number`).
   * @returns Response dengan pesan sesuai skenario.
   */
  private respondToVerification(
    res: Response,
    result: OtpVerifyResult,
    options: { email: boolean },
  ): ResponseWithMessage<ParticipantSessionResponse | PendingProfileResponse> {
    if (result.kind === 'existing') {
      const token = this.startSession(res, result.user);
      return new ResponseWithMessage(
        { token, user: toUserResponse(result.user), is_new_user: false },
        'Login berhasil',
      );
    }
    const identity = options.email
      ? { email: result.identifier }
      : { phone_number: result.identifier };
    return new ResponseWithMessage(
      {
        temp_token: result.tempToken,
        ...identity,
        is_new_user: true,
        requires_profile: true,
      },
      'OTP terverifikasi, lengkapi profil',
    );
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
