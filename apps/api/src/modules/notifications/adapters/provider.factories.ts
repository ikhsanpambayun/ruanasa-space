import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../../config/env.validation';
import {
  ConsoleEmailAdapter,
  ResendEmailAdapter,
  type EmailProvider,
} from './email.adapter';
import {
  ConsoleWhatsAppAdapter,
  FonnteAdapter,
  type WhatsAppProvider,
} from './whatsapp.adapter';

const DEFAULT_FONNTE_URL = 'https://api.fonnte.com';

/**
 * Menentukan apakah environment boleh memakai adapter console (hanya development dan test).
 *
 * @param config - Konfigurasi aplikasi.
 * @returns True bila adapter console diizinkan.
 */
function allowsConsoleAdapters(config: ConfigService<Env, true>): boolean {
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  return nodeEnv === 'development' || nodeEnv === 'test';
}

/**
 * Membuat provider email sesuai konfigurasi. Tanpa kredensial: adapter console di development/test,
 * dan error saat startup di staging/production (gagal cepat, bukan diam-diam tidak mengirim OTP).
 *
 * @param config - Konfigurasi aplikasi.
 * @returns Provider email.
 * @throws Error bila kredensial wajib tidak ada di staging/production atau provider tidak didukung.
 */
export function createEmailProvider(
  config: ConfigService<Env, true>,
): EmailProvider {
  const apiKey = config.get('EMAIL_API_KEY', { infer: true });
  const fromAddress = config.get('EMAIL_FROM_ADDRESS', { infer: true });
  const provider = config.get('EMAIL_PROVIDER', { infer: true });

  if (!apiKey || !fromAddress) {
    if (allowsConsoleAdapters(config)) {
      return new ConsoleEmailAdapter();
    }
    throw new Error(
      'EMAIL_API_KEY and EMAIL_FROM_ADDRESS are required outside development',
    );
  }
  if (provider && provider !== 'resend') {
    throw new Error(
      `Unsupported EMAIL_PROVIDER "${provider}" (supported: resend)`,
    );
  }
  return new ResendEmailAdapter(
    apiKey,
    fromAddress,
    config.get('EMAIL_FROM_NAME', { infer: true }) ?? 'Ruanasa Space',
  );
}

/**
 * Membuat provider WhatsApp sesuai konfigurasi, dengan aturan fallback yang sama seperti email.
 *
 * @param config - Konfigurasi aplikasi.
 * @returns Provider WhatsApp.
 * @throws Error bila kredensial wajib tidak ada di staging/production atau provider belum diimplementasikan.
 */
export function createWhatsAppProvider(
  config: ConfigService<Env, true>,
): WhatsAppProvider {
  const apiKey = config.get('WHATSAPP_API_KEY', { infer: true });
  const provider = config.get('WHATSAPP_PROVIDER', { infer: true });

  if (!apiKey || !provider) {
    if (allowsConsoleAdapters(config)) {
      return new ConsoleWhatsAppAdapter();
    }
    throw new Error(
      'WHATSAPP_PROVIDER and WHATSAPP_API_KEY are required outside development',
    );
  }
  if (provider === 'wablas') {
    throw new Error(
      'WHATSAPP_PROVIDER "wablas" is not implemented yet (supported: fonnte)',
    );
  }
  return new FonnteAdapter(
    config.get('WHATSAPP_API_URL', { infer: true }) ?? DEFAULT_FONNTE_URL,
    apiKey,
  );
}
