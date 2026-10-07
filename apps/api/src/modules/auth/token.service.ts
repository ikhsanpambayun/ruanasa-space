import { randomUUID } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';

import { ERROR_CODES } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { parseDurationToSeconds } from '../../common/utils/duration.util';
import type { Env } from '../../config/env.validation';
import { SESSION_COOKIE_NAME, TEMP_TOKEN_TTL_SECONDS } from './auth.constants';
import type {
  AuthenticatedUser,
  IssuedToken,
  TempTokenClaims,
  TempTokenPayload,
  TempTokenPurpose,
} from './auth.types';
import { TokenBlacklistStore } from './token-blacklist.store';

const JWT_ALGORITHM = 'HS256';

/**
 * Penerbitan dan validasi token: JWT akses (HS256, sliding window), temp_token untuk alur
 * "complete registration", blacklist saat logout, dan pengaturan cookie sesi.
 */
@Injectable()
export class TokenService {
  /**
   * @param jwt - JwtService (secret dan algoritma dikonfigurasi di AuthModule).
   * @param config - Konfigurasi aplikasi.
   * @param blacklist - Penyimpanan token yang di-logout dan temp_token yang sudah dipakai.
   */
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly blacklist: TokenBlacklistStore,
  ) {}

  /**
   * Menerbitkan JWT akses dengan payload `{ sub, role, iat, exp }`.
   *
   * @param user - User yang akan diautentikasi.
   * @returns Token dan waktu kedaluwarsanya (epoch detik).
   */
  signAccessToken(user: AuthenticatedUser): IssuedToken {
    const ttl = parseDurationToSeconds(
      this.config.get('JWT_EXPIRY', { infer: true }),
    );
    const token = this.jwt.sign(
      { sub: user.id, role: user.role },
      { expiresIn: ttl },
    );
    return { token, expiresAt: this.readExpiry(token) };
  }

  /**
   * Memasukkan token ke blacklist sampai kedaluwarsa (dipakai saat logout).
   *
   * @param token - JWT akses yang dinonaktifkan.
   */
  blacklistToken(token: string): void {
    const decoded = this.jwt.decode<{ exp?: number } | null>(token);
    if (decoded && typeof decoded.exp === 'number') {
      this.blacklist.addToken(token, decoded.exp);
    }
  }

  /**
   * Memeriksa apakah token sudah di-blacklist.
   *
   * @param token - JWT akses.
   * @returns True bila tidak boleh dipakai lagi.
   */
  isBlacklisted(token: string): boolean {
    return this.blacklist.hasToken(token);
  }

  /**
   * Menerbitkan temp_token berumur 15 menit untuk melengkapi registrasi. Berisi data yang sudah
   * terverifikasi (email Google, email/nomor yang lolos OTP) dan tidak dapat dipakai sebagai token akses.
   *
   * @param purpose - Tujuan token.
   * @param claims - Data terverifikasi yang dibawa token.
   * @returns String temp_token.
   */
  signTempToken(purpose: TempTokenPurpose, claims: TempTokenClaims): string {
    return this.jwt.sign(
      { purpose, jti: randomUUID(), ...claims },
      { expiresIn: TEMP_TOKEN_TTL_SECONDS },
    );
  }

  /**
   * Memverifikasi temp_token: tanda tangan, masa berlaku, tujuan, dan belum pernah dipakai.
   *
   * @param token - temp_token dari client.
   * @param purpose - Tujuan yang diharapkan endpoint.
   * @returns Payload temp_token.
   * @throws AppException 401 UNAUTHORIZED bila tidak valid.
   */
  verifyTempToken(token: string, purpose: TempTokenPurpose): TempTokenPayload {
    let payload: TempTokenPayload;
    try {
      payload = this.jwt.verify<TempTokenPayload>(token, {
        algorithms: [JWT_ALGORITHM],
      });
    } catch {
      throw this.invalidTempToken();
    }

    if (payload.purpose !== purpose || typeof payload.jti !== 'string') {
      throw this.invalidTempToken();
    }
    if (this.blacklist.isTempTokenUsed(payload.jti)) {
      throw this.invalidTempToken();
    }
    return payload;
  }

  /**
   * Menandai temp_token sudah dipakai. Dipanggil setelah user berhasil dibuat, bukan sebelumnya,
   * agar user dapat memperbaiki input (misalnya nomor telepon bentrok) tanpa mengulang verifikasi.
   *
   * @param payload - Payload temp_token yang sudah diverifikasi.
   */
  consumeTempToken(payload: TempTokenPayload): void {
    this.blacklist.markTempTokenUsed(payload.jti, payload.exp);
  }

  /**
   * Menulis cookie sesi httpOnly. Secure aktif di luar development/test; SameSite=Strict, Path=/.
   *
   * @param res - Response Express.
   * @param issued - Token akses yang baru diterbitkan.
   */
  setSessionCookie(res: Response, issued: IssuedToken): void {
    const maxAgeMs = Math.max(0, issued.expiresAt * 1000 - Date.now());
    res.cookie(SESSION_COOKIE_NAME, issued.token, {
      ...this.cookieOptions(),
      maxAge: maxAgeMs,
    });
  }

  /**
   * Menghapus cookie sesi.
   *
   * @param res - Response Express.
   */
  clearSessionCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE_NAME, this.cookieOptions());
  }

  private cookieOptions(): {
    httpOnly: true;
    secure: boolean;
    sameSite: 'strict';
    path: string;
  } {
    const nodeEnv = this.config.get('NODE_ENV', { infer: true });
    return {
      httpOnly: true,
      secure: nodeEnv !== 'development' && nodeEnv !== 'test',
      sameSite: 'strict',
      path: '/',
    };
  }

  private readExpiry(token: string): number {
    const decoded = this.jwt.decode<{ exp: number }>(token);
    return decoded.exp;
  }

  private invalidTempToken(): AppException {
    return new AppException(
      HttpStatus.UNAUTHORIZED,
      ERROR_CODES.UNAUTHORIZED,
      'Sesi registrasi tidak valid atau sudah berakhir, silakan ulangi proses login',
    );
  }
}
