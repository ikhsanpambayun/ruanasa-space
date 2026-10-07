import { Logger } from '@nestjs/common';

import { toInternationalPhone } from '../../../common/utils/phone.util';
import type { FetchFunction } from './email.adapter';
import type { SendResult } from './send-result';

/**
 * Token DI untuk provider WhatsApp aktif.
 */
export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

/**
 * Kontrak provider WhatsApp (TAD v1.6 Section 6.2). Nomor diberikan dalam format kanonik 08xxxxxxxxxx.
 */
export interface WhatsAppProvider {
  sendMessage(phoneNumber: string, message: string): Promise<SendResult>;
}

/**
 * Adapter Fonnte (https://fonnte.com).
 */
export class FonnteAdapter implements WhatsAppProvider {
  private readonly logger = new Logger(FonnteAdapter.name);

  /**
   * @param apiUrl - Base URL API Fonnte (default https://api.fonnte.com).
   * @param apiKey - Token device Fonnte.
   * @param fetchFn - Fungsi fetch (dapat diganti pada test).
   */
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly fetchFn: FetchFunction = fetch,
  ) {}

  /**
   * Mengirim pesan WhatsApp lewat Fonnte.
   *
   * @param phoneNumber - Nomor tujuan format 08xxxxxxxxxx.
   * @param message - Isi pesan.
   * @returns Hasil pengiriman.
   */
  async sendMessage(phoneNumber: string, message: string): Promise<SendResult> {
    try {
      const response = await this.fetchFn(
        `${this.apiUrl.replace(/\/+$/, '')}/send`,
        {
          method: 'POST',
          headers: {
            Authorization: this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            target: toInternationalPhone(phoneNumber),
            message,
          }),
        },
      );
      if (!response.ok) {
        this.logger.error(
          `Fonnte rejected the message with HTTP ${response.status}`,
        );
        return { success: false, error: `Fonnte HTTP ${response.status}` };
      }
      // Fonnte membalas 200 dengan { status: false, reason } untuk kegagalan logis (token salah, device putus).
      const body = (await response.json().catch(() => null)) as {
        status?: boolean;
        reason?: string;
      } | null;
      if (body && body.status === false) {
        this.logger.error(
          `Fonnte reported a failure: ${body.reason ?? 'no reason given'}`,
        );
        return {
          success: false,
          error: body.reason ?? 'Fonnte reported failure',
        };
      }
      return { success: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Fonnte request failed: ${reason}`);
      return { success: false, error: reason };
    }
  }
}

/**
 * Adapter development: mencetak pesan ke log alih-alih mengirim. TIDAK PERNAH dipakai di staging/production.
 */
export class ConsoleWhatsAppAdapter implements WhatsAppProvider {
  private readonly logger = new Logger('DevWhatsApp');

  /**
   * @param phoneNumber - Nomor tujuan.
   * @param message - Pesan yang "dikirim".
   * @returns Selalu sukses.
   */
  sendMessage(phoneNumber: string, message: string): Promise<SendResult> {
    this.logger.warn(`[dev only, not sent] to=${phoneNumber}\n${message}`);
    return Promise.resolve({ success: true });
  }
}
