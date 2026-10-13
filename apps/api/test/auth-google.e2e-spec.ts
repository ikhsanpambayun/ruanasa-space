import request from 'supertest';

import { GOOGLE_TOKEN_VERIFIER } from '../src/modules/auth/google/google-token.verifier';
import { createTestApp, type TestApp } from './helpers/create-test-app';
import { FakeGoogleVerifier } from './helpers/fake-google-verifier';
import { bodyOf } from './test-env';

interface DataBody {
  message: string;
  data: Record<string, unknown> & { user?: Record<string, unknown> };
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

describe('Google login (e2e)', () => {
  let ctx: TestApp;
  const google = new FakeGoogleVerifier();

  const post = (path: string, body: unknown): request.Test =>
    request(ctx.app.getHttpServer())
      .post(`/api/v1/auth/${path}`)
      .send(body as object);

  beforeAll(async () => {
    ctx = await createTestApp({
      configure: (builder) =>
        builder.overrideProvider(GOOGLE_TOKEN_VERIFIER).useValue(google),
    });
    google.register('new-user', {
      email: 'gina@example.com',
      emailVerified: true,
      name: 'Gina Putri',
      picture: 'https://lh3.googleusercontent.com/a/gina',
    });
    google.register('existing-user', {
      email: 'lama@example.com',
      emailVerified: true,
      name: 'Lama',
    });
    google.register('unverified', {
      email: 'belum@example.com',
      emailVerified: false,
    });
    google.register('admin-user', {
      email: 'admin@example.com',
      emailVerified: true,
      name: 'Admin',
    });
    ctx.users.add({
      email: 'lama@example.com',
      phoneNumber: '081111111111',
      authProvider: 'auto_created',
    });
    ctx.users.add({
      email: 'admin@example.com',
      phoneNumber: '081200000000',
      role: 'admin',
    });
    ctx.users.add({ phoneNumber: '082222222222' });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('logs an existing user in, sets the session cookie, and links auth_provider to google', async () => {
    const res = await post('google', { id_token: 'existing-user' }).expect(200);
    const body = res.body as DataBody;

    expect(body.message).toBe('Login berhasil');
    expect(body.data).toMatchObject({ is_new_user: false });
    expect(body.data.user).toMatchObject({
      email: 'lama@example.com',
      auth_provider: 'google',
      role: 'participant',
    });
    expect(typeof body.data.token).toBe('string');
    expect(
      setCookies(res).some(
        (c) => c.startsWith('token=') && c.includes('HttpOnly'),
      ),
    ).toBe(true);
  });

  it('answers a new Google user with temp_token and requires_phone, creating nothing yet', async () => {
    const res = await post('google', { id_token: 'new-user' }).expect(200);
    const body = res.body as DataBody;

    expect(body.message).toBe('Akun baru, lengkapi nomor telepon');
    expect(body.data).toMatchObject({
      name: 'Gina Putri',
      email: 'gina@example.com',
      is_new_user: true,
      requires_phone: true,
    });
    expect(typeof body.data.temp_token).toBe('string');
    expect(setCookies(res)).toEqual([]);
    expect(await ctx.users.findByEmail('gina@example.com')).toBeNull();
  });

  it('completes registration: 409 on a taken phone, then success with a free phone, then replay is refused', async () => {
    const first = await post('google', { id_token: 'new-user' }).expect(200);
    const tempToken = (first.body as DataBody).data.temp_token;

    const conflict = await post('google/complete', {
      temp_token: tempToken,
      phone_number: '082222222222',
    }).expect(409);
    expect(bodyOf(conflict)).toEqual({
      success: false,
      message:
        'Nomor telepon ini sudah terdaftar, silakan login untuk melanjutkan',
      error_code: 'PHONE_ALREADY_EXISTS',
    });

    const done = await post('google/complete', {
      temp_token: tempToken,
      phone_number: '+62 813-0000-1111',
    }).expect(200);
    const doneBody = done.body as DataBody;
    expect(doneBody.message).toBe('Registrasi berhasil');
    expect(doneBody.data.user).toMatchObject({
      name: 'Gina Putri',
      email: 'gina@example.com',
      phone_number: '081300001111',
      auth_provider: 'google',
      profile_picture: 'https://lh3.googleusercontent.com/a/gina',
    });
    expect(setCookies(done).some((c) => c.startsWith('token='))).toBe(true);

    const replay = await post('google/complete', {
      temp_token: tempToken,
      phone_number: '081399990000',
    }).expect(401);
    expect(bodyOf(replay).error_code).toBe('UNAUTHORIZED');
  });

  it('rejects an invalid id_token with 401 INVALID_GOOGLE_TOKEN', async () => {
    const res = await post('google', { id_token: 'palsu' }).expect(401);

    expect(bodyOf(res)).toEqual({
      success: false,
      message: 'Token Google tidak valid',
      error_code: 'INVALID_GOOGLE_TOKEN',
    });
  });

  it('rejects a Google account whose email is not verified', async () => {
    const res = await post('google', { id_token: 'unverified' }).expect(401);

    expect(bodyOf(res).error_code).toBe('INVALID_GOOGLE_TOKEN');
  });

  it('never logs an admin in through Google and sets no session', async () => {
    const res = await post('google', { id_token: 'admin-user' }).expect(401);

    expect(bodyOf(res).error_code).toBe('AUTH_FAILED');
    expect(setCookies(res)).toEqual([]);
  });

  it('validates input with 422', async () => {
    const missing = await post('google', {}).expect(422);
    expect(bodyOf(missing).errors?.id_token).toBeDefined();

    const badPhone = await post('google/complete', {
      temp_token: 'x',
      phone_number: '123',
    }).expect(422);
    expect(bodyOf(badPhone).errors?.phone_number).toContain(
      'Format nomor telepon tidak valid',
    );
  });
});
