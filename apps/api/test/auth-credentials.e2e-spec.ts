import { hash } from 'bcryptjs';
import request from 'supertest';

import { createTestApp, type TestApp } from './helpers/create-test-app';
import { bodyOf } from './test-env';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'CorrectHorse-Battery9';

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

describe('POST /auth/admin/login (e2e)', () => {
  let ctx: TestApp;
  let adminId: string;

  const post = (body: unknown): request.Test =>
    request(ctx.app.getHttpServer())
      .post('/api/v1/auth/admin/login')
      .send(body as object);

  beforeAll(async () => {
    ctx = await createTestApp();
    const passwordHash = await hash(ADMIN_PASSWORD, 4);
    adminId = ctx.users.add({
      name: 'Admin Ruanasa',
      email: ADMIN_EMAIL,
      role: 'admin',
      passwordHash,
      authProvider: 'email_otp',
    }).id;
    ctx.users.add({
      email: 'peserta@example.com',
      role: 'participant',
      passwordHash: await hash('PesertaPass1', 4),
    });
    ctx.users.add({
      email: 'nopass@example.com',
      role: 'admin',
      passwordHash: null,
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('logs the admin in and returns a JWT with role admin in body and cookie', async () => {
    const res = await post({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }).expect(200);

    const body = res.body as {
      success: boolean;
      message: string;
      data: { token: string; user: Record<string, unknown> };
    };
    expect(body.success).toBe(true);
    expect(body.message).toBe('Login berhasil');
    expect(body.data.user).toEqual({
      id: adminId,
      name: 'Admin Ruanasa',
      email: ADMIN_EMAIL,
      role: 'admin',
    });

    const payload = JSON.parse(
      Buffer.from(body.data.token.split('.')[1] ?? '', 'base64url').toString(),
    ) as {
      sub: string;
      role: string;
    };
    expect(payload).toMatchObject({ sub: adminId, role: 'admin' });

    const cookie = setCookies(res).find((c) => c.startsWith('token='));
    expect(cookie).toContain(`token=${body.data.token}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('issues a token that authenticates later requests', async () => {
    const login = await post({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }).expect(200);
    const token = (login.body as { data: { token: string } }).data.token;

    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('matches the email case-insensitively', async () => {
    await post({ email: 'ADMIN@Example.COM', password: ADMIN_PASSWORD }).expect(
      200,
    );
  });

  it('rejects a wrong password with 401 AUTH_FAILED', async () => {
    const res = await post({
      email: ADMIN_EMAIL,
      password: 'wrong-password',
    }).expect(401);

    expect(bodyOf(res)).toEqual({
      success: false,
      message: 'Email atau password salah',
      error_code: 'AUTH_FAILED',
    });
  });

  it('returns the identical error for an unknown email (does not reveal whether the email exists)', async () => {
    const wrongPassword = await post({
      email: ADMIN_EMAIL,
      password: 'wrong-password',
    }).expect(401);
    const unknownEmail = await post({
      email: 'ghost@example.com',
      password: 'wrong-password',
    }).expect(401);

    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it('rejects a participant account even with the correct password', async () => {
    const res = await post({
      email: 'peserta@example.com',
      password: 'PesertaPass1',
    }).expect(401);

    expect(bodyOf(res).error_code).toBe('AUTH_FAILED');
  });

  it('rejects an admin account that has no password hash', async () => {
    const res = await post({
      email: 'nopass@example.com',
      password: 'anything',
    }).expect(401);

    expect(bodyOf(res).error_code).toBe('AUTH_FAILED');
  });

  it('validates the request body (422)', async () => {
    const missing = await post({ email: ADMIN_EMAIL }).expect(422);
    expect(bodyOf(missing).errors?.password).toContain('Password wajib diisi');

    const badEmail = await post({ email: 'bukan-email', password: 'x' }).expect(
      422,
    );
    expect(bodyOf(badEmail).errors?.email).toContain(
      'Format email tidak valid',
    );
  });
});

describe('POST /auth/admin/login rate limit (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('allows 10 attempts per minute and returns 429 RATE_LIMITED on the 11th', async () => {
    const attempt = (): request.Test =>
      request(ctx.app.getHttpServer())
        .post('/api/v1/auth/admin/login')
        .send({ email: 'ghost@example.com', password: 'nope' });

    for (let i = 1; i <= 10; i += 1) {
      await attempt().expect(401);
    }
    const res = await attempt().expect(429);

    expect(bodyOf(res).error_code).toBe('RATE_LIMITED');
  });
});

describe('POST /auth/auto-create (e2e)', () => {
  let ctx: TestApp;

  const post = (body: unknown): request.Test =>
    request(ctx.app.getHttpServer())
      .post('/api/v1/auth/auto-create')
      .send(body as object);

  beforeAll(async () => {
    ctx = await createTestApp();
    ctx.users.add({
      phoneNumber: '081111111111',
      email: 'sudah-ada@example.com',
    });
    ctx.users.add({
      phoneNumber: '082222222222',
      email: 'email-lain@example.com',
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('creates an auto_created participant from messy input and authenticates immediately (201)', async () => {
    const res = await post({
      name: '  Budi Santoso  ',
      phone_number: '+62 812-3456-7890',
      email: 'BUDI@Example.com',
    }).expect(201);

    const body = res.body as {
      message: string;
      data: {
        token: string;
        is_new_user: boolean;
        user: Record<string, unknown>;
      };
    };
    expect(body.message).toBe('Akun berhasil dibuat');
    expect(body.data.is_new_user).toBe(true);
    expect(body.data.user).toMatchObject({
      name: 'Budi Santoso',
      email: 'budi@example.com',
      phone_number: '081234567890',
      role: 'participant',
      auth_provider: 'auto_created',
      profile_picture: null,
    });
    expect(
      setCookies(res).some(
        (c) => c.startsWith('token=') && c.includes('HttpOnly'),
      ),
    ).toBe(true);

    const stored = await ctx.users.findByPhone('081234567890');
    expect(stored?.authProvider).toBe('auto_created');
    expect(stored?.role).toBe('participant');

    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${body.data.token}`)
      .expect(200);
  });

  it('rejects a registered phone number with 409 PHONE_ALREADY_EXISTS', async () => {
    const res = await post({
      name: 'X',
      phone_number: '081111111111',
      email: 'baru@example.com',
    }).expect(409);

    expect(bodyOf(res)).toEqual({
      success: false,
      message:
        'Nomor telepon ini sudah terdaftar, silakan login untuk melanjutkan',
      error_code: 'PHONE_ALREADY_EXISTS',
    });
  });

  it('rejects a registered email with 409 EMAIL_ALREADY_EXISTS', async () => {
    const res = await post({
      name: 'X',
      phone_number: '083333333333',
      email: 'sudah-ada@example.com',
    }).expect(409);

    expect(bodyOf(res)).toEqual({
      success: false,
      message: 'Email ini sudah terdaftar, silakan login untuk melanjutkan',
      error_code: 'EMAIL_ALREADY_EXISTS',
    });
  });

  it('checks the phone number before the email when both are registered', async () => {
    const res = await post({
      name: 'X',
      phone_number: '081111111111',
      email: 'email-lain@example.com',
    }).expect(409);

    expect(bodyOf(res).error_code).toBe('PHONE_ALREADY_EXISTS');
  });

  it('does not create a user when the request is rejected', async () => {
    expect(await ctx.users.findByEmail('baru@example.com')).toBeNull();
  });
});

describe('POST /auth/auto-create validation and limits (e2e)', () => {
  let ctx: TestApp;

  const post = (body: unknown): request.Test =>
    request(ctx.app.getHttpServer())
      .post('/api/v1/auth/auto-create')
      .send(body as object);

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('returns field-level 422 errors with the specified messages', async () => {
    const res = await post({
      name: '',
      phone_number: '12345',
      email: 'bukan-email',
    }).expect(422);

    const body = bodyOf(res);
    expect(body.error_code).toBe('VALIDATION_ERROR');
    expect(body.errors?.name).toContain('Nama wajib diisi');
    expect(body.errors?.phone_number).toContain(
      'Format nomor telepon tidak valid',
    );
    expect(body.errors?.email).toContain('Format email tidak valid');
  });

  it('allows 5 requests per minute per IP and returns 429 on the 6th', async () => {
    const fresh = await createTestApp();
    try {
      const attempt = (): request.Test =>
        request(fresh.app.getHttpServer())
          .post('/api/v1/auth/auto-create')
          .send({ name: '', phone_number: '081', email: 'x' });

      for (let i = 1; i <= 5; i += 1) {
        await attempt().expect(422);
      }
      const res = await attempt().expect(429);
      expect(bodyOf(res).error_code).toBe('RATE_LIMITED');
    } finally {
      await fresh.app.close();
    }
  });
});
