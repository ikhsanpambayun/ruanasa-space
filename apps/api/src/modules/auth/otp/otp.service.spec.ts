import { createHash } from 'node:crypto';

import {
  CapturingEmailProvider,
  CapturingWhatsAppProvider,
} from '../../../../test/helpers/capturing-providers';
import { OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS, OtpService } from './otp.service';
import { InMemoryOtpStore } from './otp.store';

const EMAIL = 'budi@example.com';
const PHONE = '081234567890';
const MINUTE = 60_000;

/**
 * Menjalankan fungsi async dan mengembalikan error yang dilempar (atau null).
 *
 * @param fn - Fungsi yang diuji.
 * @returns Error yang dilempar, atau null.
 */
async function errorOf(
  fn: () => unknown,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    const http = error as {
      getStatus: () => number;
      getResponse: () => Record<string, unknown>;
    };
    return { status: http.getStatus(), body: http.getResponse() };
  }
}

describe('OtpService', () => {
  let store: InMemoryOtpStore;
  let email: CapturingEmailProvider;
  let whatsapp: CapturingWhatsAppProvider;
  let service: OtpService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-07T08:00:00Z') });
    store = new InMemoryOtpStore();
    email = new CapturingEmailProvider();
    whatsapp = new CapturingWhatsAppProvider();
    service = new OtpService(store, email, whatsapp);
  });

  afterEach(() => {
    store.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('requestOtp', () => {
    it('sends a 6-digit code by email and returns a session id valid for 5 minutes', async () => {
      const result = await service.requestOtp('email', EMAIL);

      expect(result.expires_in).toBe(300);
      expect(result.otp_session_id.length).toBeGreaterThan(20);
      expect(email.sent).toHaveLength(1);
      expect(email.sent[0]?.to).toBe(EMAIL);
      expect(email.lastCode()).toMatch(/^\d{6}$/);
    });

    it('sends the code by WhatsApp for the whatsapp channel', async () => {
      await service.requestOtp('whatsapp', PHONE);

      expect(whatsapp.sent).toHaveLength(1);
      expect(whatsapp.sent[0]?.phoneNumber).toBe(PHONE);
      expect(whatsapp.lastCode()).toMatch(/^\d{6}$/);
      expect(email.sent).toHaveLength(0);
    });

    it('never stores the plain code, only a salted SHA-256 hash', async () => {
      const { otp_session_id: id } = await service.requestOtp('email', EMAIL);
      const code = email.lastCode();
      const session = store.get(id);

      expect(JSON.stringify(session)).not.toContain(code);
      expect(session?.codeHash).toBe(
        createHash('sha256').update(`${id}:${code}`).digest('hex'),
      );
    });

    it('generates different codes across requests', async () => {
      const codes = new Set<string>();
      for (const identifier of [
        'a@example.com',
        'b@example.com',
        'c@example.com',
        'd@example.com',
        'e@example.com',
      ]) {
        await service.requestOtp('email', identifier);
        codes.add(email.lastCode());
      }

      expect(codes.size).toBeGreaterThan(1);
    });

    it('allows 3 requests per 15 minutes per identifier and rejects the 4th with OTP_RATE_LIMITED', async () => {
      await service.requestOtp('email', EMAIL);
      await service.requestOtp('email', EMAIL);
      await service.requestOtp('email', EMAIL);

      const error = await errorOf(() => service.requestOtp('email', EMAIL));

      expect(error?.status).toBe(429);
      expect(error?.body).toMatchObject({
        error_code: 'OTP_RATE_LIMITED',
        message: 'Terlalu banyak permintaan, silakan tunggu 15 menit',
      });
      expect(email.sent).toHaveLength(3);
    });

    it('allows requests again once the 15-minute window has passed', async () => {
      await service.requestOtp('email', EMAIL);
      await service.requestOtp('email', EMAIL);
      await service.requestOtp('email', EMAIL);

      jest.setSystemTime(Date.now() + 15 * MINUTE + 1);

      await expect(service.requestOtp('email', EMAIL)).resolves.toBeDefined();
    });

    it('keeps the limit per identifier and per channel', async () => {
      for (let i = 0; i < 3; i += 1) {
        await service.requestOtp('email', EMAIL);
      }

      await expect(
        service.requestOtp('email', 'lain@example.com'),
      ).resolves.toBeDefined();
      await expect(
        service.requestOtp('whatsapp', EMAIL),
      ).resolves.toBeDefined();
    });

    it('invalidates the previous OTP when a new one is requested', async () => {
      const first = await service.requestOtp('email', EMAIL);
      const firstCode = email.lastCode();
      await service.requestOtp('email', EMAIL);

      const error = await errorOf(() =>
        service.verifyOtp('email', first.otp_session_id, firstCode),
      );

      expect(error?.body).toMatchObject({ error_code: 'OTP_EXPIRED' });
    });

    it('fails with 502 INTERNAL_ERROR when delivery fails, and refunds the rate-limit slot', async () => {
      email.failNext = true;
      const error = await errorOf(() => service.requestOtp('email', EMAIL));

      expect(error?.status).toBe(502);
      expect(error?.body).toMatchObject({
        error_code: 'INTERNAL_ERROR',
        message: 'Gagal mengirim OTP, silakan coba lagi',
      });

      // Kegagalan kirim tidak menghabiskan jatah: masih bisa 3 request berhasil.
      await service.requestOtp('email', EMAIL);
      await service.requestOtp('email', EMAIL);
      await expect(service.requestOtp('email', EMAIL)).resolves.toBeDefined();
    });

    it('keeps the previous OTP usable when sending the new one fails', async () => {
      const first = await service.requestOtp('email', EMAIL);
      const firstCode = email.lastCode();

      email.failNext = true;
      await errorOf(() => service.requestOtp('email', EMAIL));

      expect(service.verifyOtp('email', first.otp_session_id, firstCode)).toBe(
        EMAIL,
      );
    });
  });

  describe('verifyOtp', () => {
    it('returns the identifier for the correct code and consumes the session (single use)', async () => {
      const { otp_session_id: id } = await service.requestOtp('email', EMAIL);
      const code = email.lastCode();

      expect(service.verifyOtp('email', id, code)).toBe(EMAIL);
      const second = await errorOf(() => service.verifyOtp('email', id, code));

      expect(second?.body).toMatchObject({ error_code: 'OTP_EXPIRED' });
    });

    it('rejects a wrong code with 400 OTP_INVALID', async () => {
      const { otp_session_id: id } = await service.requestOtp('email', EMAIL);
      const wrong = email.lastCode() === '000000' ? '111111' : '000000';

      const error = await errorOf(() => service.verifyOtp('email', id, wrong));

      expect(error?.status).toBe(400);
      expect(error?.body).toMatchObject({
        error_code: 'OTP_INVALID',
        message: 'Kode OTP salah',
      });
    });

    it('counts wrong attempts and locks the session on the 5th with 429 OTP_MAX_ATTEMPTS', async () => {
      const { otp_session_id: id } = await service.requestOtp('email', EMAIL);
      const correct = email.lastCode();
      const wrong = correct === '000000' ? '111111' : '000000';

      for (let attempt = 1; attempt < OTP_MAX_ATTEMPTS; attempt += 1) {
        const error = await errorOf(() =>
          service.verifyOtp('email', id, wrong),
        );
        expect(error?.body).toMatchObject({ error_code: 'OTP_INVALID' });
      }
      const fifth = await errorOf(() => service.verifyOtp('email', id, wrong));
      expect(fifth?.status).toBe(429);
      expect(fifth?.body).toMatchObject({ error_code: 'OTP_MAX_ATTEMPTS' });

      // Setelah terkunci, bahkan kode yang benar ditolak: user harus request OTP baru.
      const afterLock = await errorOf(() =>
        service.verifyOtp('email', id, correct),
      );
      expect(afterLock?.status).toBe(429);
      expect(afterLock?.body).toMatchObject({ error_code: 'OTP_MAX_ATTEMPTS' });
    });

    it('still accepts the correct code after 4 wrong attempts', async () => {
      const { otp_session_id: id } = await service.requestOtp('email', EMAIL);
      const correct = email.lastCode();
      const wrong = correct === '000000' ? '111111' : '000000';

      for (let attempt = 1; attempt < OTP_MAX_ATTEMPTS; attempt += 1) {
        await errorOf(() => service.verifyOtp('email', id, wrong));
      }

      expect(service.verifyOtp('email', id, correct)).toBe(EMAIL);
    });

    it('lets the user recover by requesting a new OTP after being locked out', async () => {
      const first = await service.requestOtp('email', EMAIL);
      const wrong = email.lastCode() === '000000' ? '111111' : '000000';
      for (let attempt = 1; attempt <= OTP_MAX_ATTEMPTS; attempt += 1) {
        await errorOf(() =>
          service.verifyOtp('email', first.otp_session_id, wrong),
        );
      }

      const second = await service.requestOtp('email', EMAIL);

      expect(
        service.verifyOtp('email', second.otp_session_id, email.lastCode()),
      ).toBe(EMAIL);
    });

    it('accepts the code just before 5 minutes and rejects it after with 400 OTP_EXPIRED', async () => {
      const { otp_session_id: id } = await service.requestOtp('email', EMAIL);
      const code = email.lastCode();

      jest.setSystemTime(Date.now() + OTP_TTL_SECONDS * 1000 - 1);
      expect(service.verifyOtp('email', id, code)).toBe(EMAIL);

      const again = await service.requestOtp('email', EMAIL);
      const code2 = email.lastCode();
      jest.setSystemTime(Date.now() + OTP_TTL_SECONDS * 1000 + 1);

      const error = await errorOf(() =>
        service.verifyOtp('email', again.otp_session_id, code2),
      );
      expect(error?.status).toBe(400);
      expect(error?.body).toMatchObject({
        error_code: 'OTP_EXPIRED',
        message: 'OTP sudah expired',
      });
    });

    it('treats an unknown session id as expired', async () => {
      const error = await errorOf(() =>
        service.verifyOtp('email', 'tidak-ada', '123456'),
      );

      expect(error?.body).toMatchObject({ error_code: 'OTP_EXPIRED' });
    });

    it('does not accept an email session on the whatsapp channel (and vice versa)', async () => {
      const { otp_session_id: id } = await service.requestOtp('email', EMAIL);
      const code = email.lastCode();

      const error = await errorOf(() =>
        service.verifyOtp('whatsapp', id, code),
      );

      expect(error?.body).toMatchObject({ error_code: 'OTP_EXPIRED' });
      // Sesi tetap utuh untuk kanal yang benar.
      expect(service.verifyOtp('email', id, code)).toBe(EMAIL);
    });

    it('verifies a WhatsApp OTP and returns the phone number', async () => {
      const { otp_session_id: id } = await service.requestOtp(
        'whatsapp',
        PHONE,
      );

      expect(service.verifyOtp('whatsapp', id, whatsapp.lastCode())).toBe(
        PHONE,
      );
    });
  });
});
