import type {
  EmailMessage,
  EmailProvider,
} from '../../src/modules/notifications/adapters/email.adapter';
import type { SendResult } from '../../src/modules/notifications/adapters/send-result';
import type { WhatsAppProvider } from '../../src/modules/notifications/adapters/whatsapp.adapter';

/**
 * Mengambil kode OTP 6 digit dari teks pesan.
 *
 * @param text - Isi email atau pesan WhatsApp.
 * @returns Kode 6 digit.
 * @throws Error bila tidak ditemukan.
 */
export function extractOtp(text: string): string {
  const match = /\b(\d{6})\b/.exec(text);
  if (!match?.[1]) {
    throw new Error(`No 6-digit OTP found in message: ${text}`);
  }
  return match[1];
}

/**
 * Provider email palsu: menyimpan pesan yang "terkirim" agar test dapat membaca kode OTP.
 */
export class CapturingEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  /** Bila true, pengiriman berikutnya gagal. */
  failNext = false;

  send(message: EmailMessage): Promise<SendResult> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.resolve({ success: false, error: 'simulated failure' });
    }
    this.sent.push(message);
    return Promise.resolve({ success: true });
  }

  /** Kode OTP dari email terakhir. */
  lastCode(): string {
    const last = this.sent[this.sent.length - 1];
    if (!last) {
      throw new Error('No email was sent');
    }
    return extractOtp(last.text);
  }
}

/**
 * Provider WhatsApp palsu: menyimpan pesan yang "terkirim".
 */
export class CapturingWhatsAppProvider implements WhatsAppProvider {
  readonly sent: { phoneNumber: string; message: string }[] = [];
  /** Bila true, pengiriman berikutnya gagal. */
  failNext = false;

  sendMessage(phoneNumber: string, message: string): Promise<SendResult> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.resolve({ success: false, error: 'simulated failure' });
    }
    this.sent.push({ phoneNumber, message });
    return Promise.resolve({ success: true });
  }

  /** Kode OTP dari pesan terakhir. */
  lastCode(): string {
    const last = this.sent[this.sent.length - 1];
    if (!last) {
      throw new Error('No WhatsApp message was sent');
    }
    return extractOtp(last.message);
  }
}
