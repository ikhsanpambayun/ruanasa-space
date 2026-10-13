import { applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { RATE_LIMITS } from '../constants/rate-limits';

/**
 * Membuat dekorator rate limit untuk satu tipe endpoint.
 *
 * @param preset - Batas yang diambil dari RATE_LIMITS.
 * @returns Dekorator yang menimpa batas global pada route/controller.
 */
function limitTo(preset: {
  limit: number;
  ttl: number;
}): MethodDecorator & ClassDecorator {
  return applyDecorators(
    Throttle({ default: { limit: preset.limit, ttl: preset.ttl } }),
  );
}

/** Endpoint auth (login, OTP): 10 request/menit. */
export const AuthRateLimit = (): MethodDecorator & ClassDecorator =>
  limitTo(RATE_LIMITS.AUTH);

/** Request OTP: 3 request/15 menit. */
export const OtpRequestRateLimit = (): MethodDecorator & ClassDecorator =>
  limitTo(RATE_LIMITS.OTP_REQUEST);

/** Daftar event publik: 60 request/menit. */
export const PublicEventListRateLimit = (): MethodDecorator & ClassDecorator =>
  limitTo(RATE_LIMITS.PUBLIC_EVENT_LIST);

/** Pembuatan registrasi: 5 request/menit. */
export const RegistrationRateLimit = (): MethodDecorator & ClassDecorator =>
  limitTo(RATE_LIMITS.REGISTRATION);

/** Webhook payment gateway: 50 request/menit. */
export const WebhookRateLimit = (): MethodDecorator & ClassDecorator =>
  limitTo(RATE_LIMITS.WEBHOOK);

/** Upload file: 10 request/menit. */
export const UploadRateLimit = (): MethodDecorator & ClassDecorator =>
  limitTo(RATE_LIMITS.UPLOAD);

/** Auto-create account: 5 request/menit. */
export const AutoCreateRateLimit = (): MethodDecorator & ClassDecorator =>
  limitTo(RATE_LIMITS.AUTO_CREATE);

/** Validasi kode promo: 20 request/menit. */
export const PromoValidateRateLimit = (): MethodDecorator & ClassDecorator =>
  limitTo(RATE_LIMITS.PROMO_VALIDATE);
