import request from 'supertest';

import { EMAIL_PROVIDER } from '../src/modules/notifications/adapters/email.adapter';
import { WHATSAPP_PROVIDER } from '../src/modules/notifications/adapters/whatsapp.adapter';
import {
  CapturingEmailProvider,
  CapturingWhatsAppProvider,
} from './helpers/capturing-providers';
import { createTestApp, type TestApp } from './helpers/create-test-app';
import { bodyOf } from './test-env';

interface OtpTestContext {
  ctx: TestApp;
  email: CapturingEmailProvider;
  whatsapp: CapturingWhatsAppProvider;
}

/**
 * Membuat app test dengan provider email/WhatsApp palsu yang menangkap OTP.
 *
 * @returns Konteks test.
 */
async function createOtpApp(): Promise<OtpTestContext> {
  const email = new CapturingEmailProvider();
  const whatsapp = new CapturingWhatsAppProvider();
  const ctx = await createTestApp({
    configure: (builder) =>
      builder
        .overrideProvider(EMAIL_PROVIDER)
        .useValue(email)
        .overrideProvider(WHATSAPP_PROVIDER)
        .useValue(whatsapp),
  });
  return { ctx, email, whatsapp };
}

/**
 * Mengambil header Set-Cookie sebagai array string.
 *
 * @param res - Response supertest.
 * @returns Daftar cookie.
 */
function setCookies(res: { headers: Record<string, unknown> }): string[] {
  const value = res.headers['set-cookie'];
  return Array.isArray(value) ? (value as string[]) : [];
}

interface DataBody {
  message: string;
  data: Record<string, unknown> & { user?: Record<string, unknown> };
}

describe('Email OTP flow (e2e)', () => {
  let t: OtpTestContext;

  const post = (path: string, body: unknown): request.Test =>
    request(t.ctx.app.getHttpServer())
      .post(`/api/v1/auth/email/${path}`)
      .send(body as object);

  beforeAll(async () => {
    t = await createOtpApp();
    t.ctx.users.add({
      email: 'lama@example.com',
      phoneNumber: '081111111111',
      authProvider: 'auto_created',
    });
  });

  afterAll(async () => {
    await t.ctx.app.close();
  });

  it('registers a new user: request -> verify (temp_token) -> complete (session)', async () => {
    const requested = await post('request-otp', {
      email: 'BARU@Example.com',
    }).expect(200);
    const requestBody = requested.body as DataBody;
    expect(requestBody.message).toBe('OTP telah dikirim ke email');
    expect(requestBody.data).toMatchObject({
      expires_in: 300,
      is_existing_user: false,
    });
    expect(typeof requestBody.data.otp_session_id).toBe('string');
    expect(t.email.sent[0]?.to).toBe('baru@example.com');

    // kode salah dulu
    const wrong = t.email.lastCode() === '000000' ? '111111' : '000000';
    const bad = await post('verify-otp', {
      otp_session_id: requestBody.data.otp_session_id,
      otp_code: wrong,
    }).expect(400);
    expect(bodyOf(bad)).toMatchObject({
      error_code: 'OTP_INVALID',
      message: 'Kode OTP salah',
    });

    const verified = await post('verify-otp', {
      otp_session_id: requestBody.data.otp_session_id,
      otp_code: t.email.lastCode(),
    }).expect(200);
    const verifiedBody = verified.body as DataBody;
    expect(verifiedBody.message).toBe('OTP terverifikasi, lengkapi profil');
    expect(verifiedBody.data).toMatchObject({
      email: 'baru@example.com',
      is_new_user: true,
      requires_profile: true,
    });
    expect(setCookies(verified)).toEqual([]); // belum ada sesi sebelum profil lengkap
    expect(await t.ctx.users.findByEmail('baru@example.com')).toBeNull();

    const completed = await post('complete', {
      temp_token: verifiedBody.data.temp_token,
      name: 'Budi Santoso',
      phone_number: '+62 812-3456-7890',
    }).expect(200);
    const completedBody = completed.body as DataBody;
    expect(completedBody.message).toBe('Registrasi berhasil');
    expect(completedBody.data.user).toMatchObject({
      name: 'Budi Santoso',
      email: 'baru@example.com',
      phone_number: '081234567890',
      auth_provider: 'email_otp',
      role: 'participant',
    });
    expect(typeof completedBody.data.token).toBe('string');
    expect(
      setCookies(completed).some(
        (c) => c.startsWith('token=') && c.includes('HttpOnly'),
      ),
    ).toBe(true);

    // temp_token sekali pakai
    const replay = await post('complete', {
      temp_token: verifiedBody.data.temp_token,
      name: 'Budi Lagi',
      phone_number: '089999999999',
    }).expect(401);
    expect(bodyOf(replay).error_code).toBe('UNAUTHORIZED');
  });

  it('logs an existing user in and updates auth_provider (account linking)', async () => {
    const requested = await post('request-otp', {
      email: 'lama@example.com',
    }).expect(200);
    const sessionId = (requested.body as DataBody).data.otp_session_id;
    expect((requested.body as DataBody).data.is_existing_user).toBe(true);

    const verified = await post('verify-otp', {
      otp_session_id: sessionId,
      otp_code: t.email.lastCode(),
    }).expect(200);
    const body = verified.body as DataBody;

    expect(body.message).toBe('Login berhasil');
    expect(body.data).toMatchObject({ is_new_user: false });
    expect(body.data.user).toMatchObject({
      email: 'lama@example.com',
      auth_provider: 'email_otp',
    });
    expect(setCookies(verified).some((c) => c.startsWith('token='))).toBe(true);
    expect(
      (await t.ctx.users.findByEmail('lama@example.com'))?.authProvider,
    ).toBe('email_otp');
  });

  it('validates input with 422 (bad email, malformed code, missing fields)', async () => {
    const badEmail = await post('request-otp', { email: 'bukan-email' }).expect(
      422,
    );
    expect(bodyOf(badEmail).errors?.email).toContain(
      'Format email tidak valid',
    );

    const badCode = await post('verify-otp', {
      otp_session_id: 'abc',
      otp_code: '12ab',
    }).expect(422);
    expect(bodyOf(badCode).errors?.otp_code).toContain(
      'Kode OTP harus 6 digit angka',
    );

    const missing = await post('complete', { temp_token: 'x' }).expect(422);
    expect(bodyOf(missing).errors?.name).toBeDefined();
    expect(bodyOf(missing).errors?.phone_number).toBeDefined();
  });

  it('rejects an unknown session with 400 OTP_EXPIRED', async () => {
    const res = await post('verify-otp', {
      otp_session_id: 'tidak-ada',
      otp_code: '123456',
    }).expect(400);

    expect(bodyOf(res).error_code).toBe('OTP_EXPIRED');
  });
});

describe('Email OTP limits and delivery failures (e2e)', () => {
  let t: OtpTestContext;

  const post = (path: string, body: unknown): request.Test =>
    request(t.ctx.app.getHttpServer())
      .post(`/api/v1/auth/email/${path}`)
      .send(body as object);

  beforeAll(async () => {
    t = await createOtpApp();
  });

  afterAll(async () => {
    await t.ctx.app.close();
  });

  it('rejects the 4th OTP request for the same email within 15 minutes with 429 OTP_RATE_LIMITED', async () => {
    for (let i = 0; i < 3; i += 1) {
      await post('request-otp', { email: 'spam@example.com' }).expect(200);
    }

    const res = await post('request-otp', { email: 'spam@example.com' }).expect(
      429,
    );

    expect(bodyOf(res)).toEqual({
      success: false,
      message: 'Terlalu banyak permintaan, silakan tunggu 15 menit',
      error_code: 'OTP_RATE_LIMITED',
    });
    expect(t.email.sent).toHaveLength(3);
  });

  it('locks the session after 5 wrong codes with 429 OTP_MAX_ATTEMPTS', async () => {
    const requested = await post('request-otp', {
      email: 'brute@example.com',
    }).expect(200);
    const sessionId = (requested.body as DataBody).data.otp_session_id;
    const wrong = t.email.lastCode() === '000000' ? '111111' : '000000';

    for (let i = 0; i < 4; i += 1) {
      await post('verify-otp', {
        otp_session_id: sessionId,
        otp_code: wrong,
      }).expect(400);
    }
    const fifth = await post('verify-otp', {
      otp_session_id: sessionId,
      otp_code: wrong,
    }).expect(429);

    expect(bodyOf(fifth).error_code).toBe('OTP_MAX_ATTEMPTS');
  });

  it('returns 502 INTERNAL_ERROR when the email provider fails', async () => {
    t.email.failNext = true;

    const res = await post('request-otp', {
      email: 'gagal@example.com',
    }).expect(502);

    expect(bodyOf(res)).toMatchObject({
      error_code: 'INTERNAL_ERROR',
      message: 'Gagal mengirim OTP, silakan coba lagi',
    });
  });
});

describe('WhatsApp OTP flow (e2e)', () => {
  let t: OtpTestContext;

  const post = (path: string, body: unknown): request.Test =>
    request(t.ctx.app.getHttpServer())
      .post(`/api/v1/auth/whatsapp/${path}`)
      .send(body as object);

  beforeAll(async () => {
    t = await createOtpApp();
    t.ctx.users.add({
      email: 'ada@example.com',
      phoneNumber: '082222222222',
      authProvider: 'auto_created',
    });
  });

  afterAll(async () => {
    await t.ctx.app.close();
  });

  it('registers a new user: request -> verify (temp_token) -> complete with email', async () => {
    const requested = await post('request-otp', {
      phone_number: '+62 812-3456-7890',
    }).expect(200);
    const requestBody = requested.body as DataBody;
    expect(requestBody.message).toBe('OTP telah dikirim via WhatsApp');
    expect(requestBody.data).toMatchObject({
      expires_in: 300,
      is_existing_user: false,
    });
    expect(t.whatsapp.sent[0]?.phoneNumber).toBe('081234567890');
    expect(t.email.sent).toHaveLength(0);

    const verified = await post('verify-otp', {
      otp_session_id: requestBody.data.otp_session_id,
      otp_code: t.whatsapp.lastCode(),
    }).expect(200);
    const verifiedBody = verified.body as DataBody;
    expect(verifiedBody.message).toBe('OTP terverifikasi, lengkapi profil');
    expect(verifiedBody.data).toMatchObject({
      phone_number: '081234567890',
      is_new_user: true,
      requires_profile: true,
    });
    expect(verifiedBody.data.email).toBeUndefined();

    const completed = await post('complete', {
      temp_token: verifiedBody.data.temp_token,
      name: 'Sari Dewi',
      email: 'SARI@Example.com',
    }).expect(200);
    const completedBody = completed.body as DataBody;
    expect(completedBody.data.user).toMatchObject({
      name: 'Sari Dewi',
      email: 'sari@example.com',
      phone_number: '081234567890',
      auth_provider: 'whatsapp_otp',
    });
    expect(
      setCookies(completed).some(
        (c) => c.startsWith('token=') && c.includes('HttpOnly'),
      ),
    ).toBe(true);
  });

  it('rejects a taken email on complete with 409 EMAIL_ALREADY_EXISTS', async () => {
    const requested = await post('request-otp', {
      phone_number: '083333333333',
    }).expect(200);
    const verified = await post('verify-otp', {
      otp_session_id: (requested.body as DataBody).data.otp_session_id,
      otp_code: t.whatsapp.lastCode(),
    }).expect(200);

    const res = await post('complete', {
      temp_token: (verified.body as DataBody).data.temp_token,
      name: 'Rina',
      email: 'ada@example.com',
    }).expect(409);

    expect(bodyOf(res)).toMatchObject({
      error_code: 'EMAIL_ALREADY_EXISTS',
      message: 'Email ini sudah terdaftar, silakan login untuk melanjutkan',
    });
  });

  it('logs an existing user in by phone and updates auth_provider to whatsapp_otp', async () => {
    const requested = await post('request-otp', {
      phone_number: '082222222222',
    }).expect(200);
    expect((requested.body as DataBody).data.is_existing_user).toBe(true);

    const verified = await post('verify-otp', {
      otp_session_id: (requested.body as DataBody).data.otp_session_id,
      otp_code: t.whatsapp.lastCode(),
    }).expect(200);

    expect((verified.body as DataBody).data).toMatchObject({
      is_new_user: false,
    });
    expect((verified.body as DataBody).data.user).toMatchObject({
      auth_provider: 'whatsapp_otp',
    });
  });

  it('validates the phone number format with 422', async () => {
    const res = await post('request-otp', { phone_number: '12345' }).expect(
      422,
    );

    expect(bodyOf(res).errors?.phone_number).toContain(
      'Format nomor telepon tidak valid',
    );
  });
});

describe('Admin accounts cannot use passwordless login (e2e)', () => {
  let t: OtpTestContext;

  beforeAll(async () => {
    t = await createOtpApp();
    t.ctx.users.add({
      email: 'admin@example.com',
      phoneNumber: '081200000000',
      role: 'admin',
    });
  });

  afterAll(async () => {
    await t.ctx.app.close();
  });

  it('rejects email OTP login for an admin email with 401 AUTH_FAILED and sets no session', async () => {
    const http = request(t.ctx.app.getHttpServer());
    const requested = await http
      .post('/api/v1/auth/email/request-otp')
      .send({ email: 'admin@example.com' })
      .expect(200);
    const res = await http
      .post('/api/v1/auth/email/verify-otp')
      .send({
        otp_session_id: (requested.body as DataBody).data.otp_session_id,
        otp_code: t.email.lastCode(),
      })
      .expect(401);

    expect(bodyOf(res).error_code).toBe('AUTH_FAILED');
    expect(setCookies(res)).toEqual([]);
  });

  it('rejects WhatsApp OTP login for an admin phone with 401 AUTH_FAILED', async () => {
    const http = request(t.ctx.app.getHttpServer());
    const requested = await http
      .post('/api/v1/auth/whatsapp/request-otp')
      .send({ phone_number: '081200000000' })
      .expect(200);
    const res = await http
      .post('/api/v1/auth/whatsapp/verify-otp')
      .send({
        otp_session_id: (requested.body as DataBody).data.otp_session_id,
        otp_code: t.whatsapp.lastCode(),
      })
      .expect(401);

    expect(bodyOf(res).error_code).toBe('AUTH_FAILED');
  });
});
