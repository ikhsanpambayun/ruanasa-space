import { Logger } from '@nestjs/common';

import type { SendResult } from './send-result';

/**
 * Token DI untuk provider email aktif.
 */
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Kontrak provider email. Provider dapat diganti tanpa mengubah kode pemanggil (TAD v1.6 Section 6.2).
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<SendResult>;
}

export type FetchFunction = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Adapter Resend (https://resend.com).
 */
export class ResendEmailAdapter implements EmailProvider {
  private readonly logger = new Logger(ResendEmailAdapter.name);

  /**
   * @param apiKey - API key Resend.
   * @param fromAddress - Alamat pengirim (domain harus terverifikasi di Resend).
   * @param fromName - Nama pengirim.
   * @param fetchFn - Fungsi fetch (dapat diganti pada test).
   */
  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string,
    private readonly fromName: string,
    private readonly fetchFn: FetchFunction = fetch,
  ) {}

  /**
   * Mengirim email lewat Resend.
   *
   * @param message - Penerima, subjek, dan isi teks.
   * @returns Hasil pengiriman.
   */
  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const response = await this.fetchFn(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${this.fromName} <${this.fromAddress}>`,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      });
      if (!response.ok) {
        this.logger.error(
          `Resend rejected the email with HTTP ${response.status}`,
        );
        return { success: false, error: `Resend HTTP ${response.status}` };
      }
      return { success: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Resend request failed: ${reason}`);
      return { success: false, error: reason };
    }
  }
}

/**
 * Adapter development: mencetak email ke log alih-alih mengirim. TIDAK PERNAH dipakai di staging/production.
 */
export class ConsoleEmailAdapter implements EmailProvider {
  private readonly logger = new Logger('DevEmail');

  /**
   * @param message - Email yang "dikirim".
   * @returns Selalu sukses.
   */
  send(message: EmailMessage): Promise<SendResult> {
    this.logger.warn(
      `[dev only, not sent] to=${message.to} subject="${message.subject}"\n${message.text}`,
    );
    return Promise.resolve({ success: true });
  }
}
