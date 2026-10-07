import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';

import { ERROR_CODES } from '../../../common/constants/error-codes';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  EMAIL_PROVIDER,
  type EmailProvider,
} from '../../notifications/adapters/email.adapter';
import {
  WHATSAPP_PROVIDER,
  type WhatsAppProvider,
} from '../../notifications/adapters/whatsapp.adapter';
import { OtpStore, type OtpChannel, type OtpSession } from './otp.store';

/** Masa berlaku OTP: 5 menit (SRD v1.5 Section 4.5). */
export const OTP_TTL_SECONDS = 300;
/** Jumlah percobaan salah maksimum per sesi OTP. */
export const OTP_MAX_ATTEMPTS = 5;
/** Batas request OTP: 3 per 15 menit per identifier. */
export const OTP_REQUEST_LIMIT = 3;
export const OTP_REQUEST_WINDOW_MS = 15 * 60_000;

export interface OtpRequestResult {
  otp_session_id: string;
  expires_in: number;
}

/**
 * Pembuatan, pengiriman, dan verifikasi OTP 6 digit untuk kanal email dan WhatsApp.
 * Kode di-hash SHA-256 (dengan id sesi sebagai salt), berlaku 5 menit, maksimal 5 percobaan salah,
 * dan hanya OTP terbaru per identifier yang berlaku.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  /**
   * @param store - Penyimpanan sesi OTP dan penghitung rate limit.
   * @param email - Provider email.
   * @param whatsapp - Provider WhatsApp.
   */
  constructor(
    private readonly store: OtpStore,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
  ) {}

  /**
   * Membuat OTP baru dan mengirimkannya. Jatah request dipakai hanya bila pengiriman berhasil.
   *
   * @param channel - Kanal pengiriman.
   * @param identifier - Email (kanal email) atau nomor telepon kanonik (kanal WhatsApp).
   * @returns Id sesi OTP dan masa berlaku dalam detik.
   * @throws AppException 429 OTP_RATE_LIMITED bila melebihi 3 request per 15 menit; 502 bila pengiriman gagal.
   */
  async requestOtp(
    channel: OtpChannel,
    identifier: string,
  ): Promise<OtpRequestResult> {
    const now = Date.now();
    const rateKey = `${channel}:${identifier}`;
    const reservation = this.store.reserveRequest(
      rateKey,
      OTP_REQUEST_LIMIT,
      OTP_REQUEST_WINDOW_MS,
      now,
    );
    if (reservation === null) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.OTP_RATE_LIMITED,
        'Terlalu banyak permintaan, silakan tunggu 15 menit',
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const sessionId = randomBytes(24).toString('base64url');

    this.store.save({
      id: sessionId,
      channel,
      identifier,
      codeHash: this.hashCode(sessionId, code),
      expiresAt: now + OTP_TTL_SECONDS * 1000,
      attempts: 0,
      locked: false,
    });

    const sent = await this.deliver(channel, identifier, code);
    if (!sent) {
      this.store.delete(sessionId);
      this.store.releaseRequest(rateKey, reservation);
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        ERROR_CODES.INTERNAL_ERROR,
        'Gagal mengirim OTP, silakan coba lagi',
      );
    }

    // Hanya OTP terbaru yang berlaku. OTP lama baru dibatalkan setelah yang baru terkirim,
    // sehingga kegagalan kirim tidak membuat user kehilangan OTP yang sebelumnya masih valid.
    this.store.deleteByIdentifier(channel, identifier, sessionId);

    return { otp_session_id: sessionId, expires_in: OTP_TTL_SECONDS };
  }

  /**
   * Memverifikasi OTP. Kode yang benar menghabiskan sesi (sekali pakai).
   *
   * @param channel - Kanal yang diharapkan endpoint; sesi dari kanal lain dianggap tidak ada.
   * @param sessionId - Id sesi dari langkah request.
   * @param code - Kode 6 digit dari user.
   * @returns Identifier (email atau nomor telepon) yang berhasil diverifikasi.
   * @throws AppException 400 OTP_EXPIRED / OTP_INVALID, atau 429 OTP_MAX_ATTEMPTS.
   */
  verifyOtp(channel: OtpChannel, sessionId: string, code: string): string {
    const session = this.store.get(sessionId);
    if (!session || session.channel !== channel) {
      throw this.expired();
    }
    if (session.expiresAt <= Date.now()) {
      this.store.delete(session.id);
      throw this.expired();
    }
    if (session.locked) {
      throw this.maxAttempts();
    }

    if (!this.matches(session, code)) {
      session.attempts += 1;
      if (session.attempts >= OTP_MAX_ATTEMPTS) {
        session.locked = true;
        throw this.maxAttempts();
      }
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.OTP_INVALID,
        'Kode OTP salah',
      );
    }

    this.store.delete(session.id);
    return session.identifier;
  }

  private async deliver(
    channel: OtpChannel,
    identifier: string,
    code: string,
  ): Promise<boolean> {
    if (channel === 'email') {
      const result = await this.email.send({
        to: identifier,
        subject: 'Kode OTP Ruanasa Space',
        text: `Kode OTP Anda: ${code}\n\nKode berlaku 5 menit. Jangan bagikan kode ini kepada siapa pun, termasuk pihak yang mengaku dari Ruanasa Space.`,
      });
      if (!result.success) {
        this.logger.error(
          `Failed to deliver email OTP: ${result.error ?? 'unknown'}`,
        );
      }
      return result.success;
    }

    const result = await this.whatsapp.sendMessage(
      identifier,
      `*${code}* adalah kode OTP Ruanasa Space Anda. Berlaku 5 menit. Jangan bagikan kode ini kepada siapa pun.`,
    );
    if (!result.success) {
      this.logger.error(
        `Failed to deliver WhatsApp OTP: ${result.error ?? 'unknown'}`,
      );
    }
    return result.success;
  }

  private matches(session: OtpSession, code: string): boolean {
    const expected = Buffer.from(session.codeHash, 'hex');
    const actual = Buffer.from(this.hashCode(session.id, code), 'hex');
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private hashCode(sessionId: string, code: string): string {
    return createHash('sha256').update(`${sessionId}:${code}`).digest('hex');
  }

  private expired(): AppException {
    return new AppException(
      HttpStatus.BAD_REQUEST,
      ERROR_CODES.OTP_EXPIRED,
      'OTP sudah expired',
    );
  }

  private maxAttempts(): AppException {
    return new AppException(
      HttpStatus.TOO_MANY_REQUESTS,
      ERROR_CODES.OTP_MAX_ATTEMPTS,
      'Terlalu banyak percobaan, silakan request OTP baru',
    );
  }
}
