import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { FakeGoogleVerifier } from '../../../test/helpers/fake-google-verifier';
import { FakeUsersRepository } from '../../../test/helpers/fake-users.repository';
import {
  CapturingEmailProvider,
  CapturingWhatsAppProvider,
} from '../../../test/helpers/capturing-providers';
import type { Env } from '../../config/env.validation';
import type { UsersRepository } from '../users/users.repository';
import { AuthService } from './auth.service';
import { OtpService } from './otp/otp.service';
import { InMemoryOtpStore } from './otp/otp.store';
import { TokenBlacklistStore } from './token-blacklist.store';
import { TokenService } from './token.service';

const SECRET = 'unit-test-secret-unit-test-secret-1234';

/**
 * Menjalankan fungsi async dan mengembalikan body error HTTP yang dilempar (atau null).
 *
 * @param fn - Fungsi yang diuji.
 * @returns Status dan body error, atau null bila tidak ada error.
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

describe('AuthService OTP registration and login flows', () => {
  let users: FakeUsersRepository;
  let email: CapturingEmailProvider;
  let whatsapp: CapturingWhatsAppProvider;
  let google: FakeGoogleVerifier;
  let tokens: TokenService;
  let jwt: JwtService;
  let otpStore: InMemoryOtpStore;
  let blacklist: TokenBlacklistStore;
  let service: AuthService;

  /** Meminta lalu memverifikasi OTP email dengan kode yang benar. */
  const verifyEmail = async (
    address: string,
  ): ReturnType<AuthService['verifyEmailOtp']> => {
    const { otp_session_id: id } = await service.requestEmailOtp(address);
    return service.verifyEmailOtp(id, email.lastCode());
  };

  /** Meminta lalu memverifikasi OTP WhatsApp dengan kode yang benar. */
  const verifyWhatsApp = async (
    phone: string,
  ): ReturnType<AuthService['verifyWhatsAppOtp']> => {
    const { otp_session_id: id } = await service.requestWhatsAppOtp(phone);
    return service.verifyWhatsAppOtp(id, whatsapp.lastCode());
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-07T08:00:00Z') });
    users = new FakeUsersRepository();
    email = new CapturingEmailProvider();
    whatsapp = new CapturingWhatsAppProvider();
    google = new FakeGoogleVerifier();
    jwt = new JwtService({
      secret: SECRET,
      signOptions: { algorithm: 'HS256' },
    });
    blacklist = new TokenBlacklistStore();
    otpStore = new InMemoryOtpStore();
    const config = {
      get: (key: string) => ({ JWT_EXPIRY: '7d', NODE_ENV: 'test' })[key],
    } as unknown as ConfigService<Env, true>;
    tokens = new TokenService(jwt, config, blacklist);
    service = new AuthService(
      tokens,
      users as unknown as UsersRepository,
      new OtpService(otpStore, email, whatsapp),
      google,
    );
  });

  afterEach(() => {
    blacklist.onModuleDestroy();
    otpStore.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('request OTP', () => {
    it('reports whether the email / phone already belongs to a user', async () => {
      users.add({ email: 'lama@example.com', phoneNumber: '081111111111' });

      expect(
        (await service.requestEmailOtp('lama@example.com')).is_existing_user,
      ).toBe(true);
      expect(
        (await service.requestEmailOtp('baru@example.com')).is_existing_user,
      ).toBe(false);
      expect(
        (await service.requestWhatsAppOtp('081111111111')).is_existing_user,
      ).toBe(true);
      expect(
        (await service.requestWhatsAppOtp('082222222222')).is_existing_user,
      ).toBe(false);
    });
  });

  describe('Email OTP', () => {
    it('sends a new user to profile completion with a temp_token (no session yet)', async () => {
      const result = await verifyEmail('baru@example.com');

      expect(result.kind).toBe('new');
      if (result.kind !== 'new') throw new Error('unreachable');
      expect(result.identifier).toBe('baru@example.com');
      expect(
        tokens.verifyTempToken(result.tempToken, 'email_complete', 'email')
          .email,
      ).toBe('baru@example.com');
      expect(users.users.size).toBe(0);
    });

    it('logs an existing user in', async () => {
      const existing = users.add({
        email: 'lama@example.com',
        authProvider: 'email_otp',
      });

      const result = await verifyEmail('lama@example.com');

      expect(result).toMatchObject({
        kind: 'existing',
        user: { id: existing.id },
      });
    });

    it('links an auto_created account by updating auth_provider to email_otp', async () => {
      const existing = users.add({
        email: 'auto@example.com',
        authProvider: 'auto_created',
      });

      await verifyEmail('auto@example.com');

      expect(users.users.get(existing.id)?.authProvider).toBe('email_otp');
    });

    it('never logs an admin in through OTP', async () => {
      const admin = users.add({
        email: 'admin@example.com',
        role: 'admin',
        authProvider: 'email_otp',
      });

      const error = await errorOf(() => verifyEmail('admin@example.com'));

      expect(error?.status).toBe(401);
      expect(error?.body).toMatchObject({ error_code: 'AUTH_FAILED' });
      expect(users.users.get(admin.id)?.authProvider).toBe('email_otp');
    });

    it('creates the user on complete with provider email_otp', async () => {
      const result = await verifyEmail('baru@example.com');
      if (result.kind !== 'new') throw new Error('unreachable');

      const user = await service.completeEmailRegistration(
        result.tempToken,
        'Budi',
        '081234567890',
      );

      expect(user).toMatchObject({
        name: 'Budi',
        email: 'baru@example.com',
        phoneNumber: '081234567890',
        authProvider: 'email_otp',
        role: 'participant',
      });
    });

    it('rejects a taken phone number with 409 and lets the user retry with the same temp_token', async () => {
      users.add({ phoneNumber: '081234567890' });
      const result = await verifyEmail('baru@example.com');
      if (result.kind !== 'new') throw new Error('unreachable');

      const error = await errorOf(() =>
        service.completeEmailRegistration(
          result.tempToken,
          'Budi',
          '081234567890',
        ),
      );
      expect(error?.status).toBe(409);
      expect(error?.body).toMatchObject({ error_code: 'PHONE_ALREADY_EXISTS' });

      const user = await service.completeEmailRegistration(
        result.tempToken,
        'Budi',
        '089999999999',
      );
      expect(user.phoneNumber).toBe('089999999999');
    });

    it('makes the temp_token single-use after a successful registration', async () => {
      const result = await verifyEmail('baru@example.com');
      if (result.kind !== 'new') throw new Error('unreachable');
      await service.completeEmailRegistration(
        result.tempToken,
        'Budi',
        '081234567890',
      );

      const error = await errorOf(() =>
        service.completeEmailRegistration(
          result.tempToken,
          'Budi',
          '089999999999',
        ),
      );

      expect(error?.status).toBe(401);
      expect(error?.body).toMatchObject({ error_code: 'UNAUTHORIZED' });
    });

    it('rejects an email that was registered by someone else in the meantime', async () => {
      const result = await verifyEmail('balapan@example.com');
      if (result.kind !== 'new') throw new Error('unreachable');
      users.add({ email: 'balapan@example.com' });

      const error = await errorOf(() =>
        service.completeEmailRegistration(
          result.tempToken,
          'Budi',
          '081234567890',
        ),
      );

      expect(error?.body).toMatchObject({ error_code: 'EMAIL_ALREADY_EXISTS' });
    });

    it('rejects a temp_token issued for another flow (whatsapp token on the email endpoint)', async () => {
      const result = await verifyWhatsApp('081234567890');
      if (result.kind !== 'new') throw new Error('unreachable');

      const error = await errorOf(() =>
        service.completeEmailRegistration(
          result.tempToken,
          'Budi',
          '089999999999',
        ),
      );

      expect(error?.status).toBe(401);
    });

    it('rejects an access token and a garbage string used as temp_token', async () => {
      const access = tokens.signAccessToken({
        id: 'u1',
        role: 'participant',
      }).token;

      expect(
        (
          await errorOf(() =>
            service.completeEmailRegistration(access, 'B', '081234567890'),
          )
        )?.status,
      ).toBe(401);
      expect(
        (
          await errorOf(() =>
            service.completeEmailRegistration('bukan-jwt', 'B', '081234567890'),
          )
        )?.status,
      ).toBe(401);
    });

    it('rejects a temp_token signed with another secret', async () => {
      const forged = new JwtService({
        secret: 'another-secret-another-secret-1234567',
      }).sign({
        purpose: 'email_complete',
        jti: 'x',
        email: 'korban@example.com',
      });

      expect(
        (
          await errorOf(() =>
            service.completeEmailRegistration(forged, 'B', '081234567890'),
          )
        )?.status,
      ).toBe(401);
    });

    it('rejects a temp_token after its 15-minute lifetime', async () => {
      const result = await verifyEmail('baru@example.com');
      if (result.kind !== 'new') throw new Error('unreachable');

      jest.setSystemTime(Date.now() + 15 * 60_000 + 1000);

      const error = await errorOf(() =>
        service.completeEmailRegistration(
          result.tempToken,
          'Budi',
          '081234567890',
        ),
      );
      expect(error?.status).toBe(401);
    });
  });

  describe('WhatsApp OTP', () => {
    it('sends a new user to profile completion with a temp_token carrying the verified phone', async () => {
      const result = await verifyWhatsApp('081234567890');

      expect(result.kind).toBe('new');
      if (result.kind !== 'new') throw new Error('unreachable');
      expect(result.identifier).toBe('081234567890');
      expect(
        tokens.verifyTempToken(
          result.tempToken,
          'whatsapp_complete',
          'phone_number',
        ).phone_number,
      ).toBe('081234567890');
    });

    it('logs an existing user in and links an auto_created account to whatsapp_otp', async () => {
      const existing = users.add({
        phoneNumber: '081234567890',
        authProvider: 'auto_created',
      });

      const result = await verifyWhatsApp('081234567890');

      expect(result).toMatchObject({
        kind: 'existing',
        user: { id: existing.id },
      });
      expect(users.users.get(existing.id)?.authProvider).toBe('whatsapp_otp');
    });

    it('never logs an admin in through WhatsApp OTP', async () => {
      users.add({ phoneNumber: '081200000000', role: 'admin' });

      const error = await errorOf(() => verifyWhatsApp('081200000000'));

      expect(error?.body).toMatchObject({ error_code: 'AUTH_FAILED' });
    });

    it('creates the user on complete with the verified phone and provider whatsapp_otp', async () => {
      const result = await verifyWhatsApp('081234567890');
      if (result.kind !== 'new') throw new Error('unreachable');

      const user = await service.completeWhatsAppRegistration(
        result.tempToken,
        'Sari',
        'sari@example.com',
      );

      expect(user).toMatchObject({
        name: 'Sari',
        email: 'sari@example.com',
        phoneNumber: '081234567890',
        authProvider: 'whatsapp_otp',
      });
    });

    it('rejects a taken email with 409 EMAIL_ALREADY_EXISTS and keeps the temp_token usable', async () => {
      users.add({ email: 'sari@example.com' });
      const result = await verifyWhatsApp('081234567890');
      if (result.kind !== 'new') throw new Error('unreachable');

      const error = await errorOf(() =>
        service.completeWhatsAppRegistration(
          result.tempToken,
          'Sari',
          'sari@example.com',
        ),
      );
      expect(error?.status).toBe(409);
      expect(error?.body).toMatchObject({ error_code: 'EMAIL_ALREADY_EXISTS' });

      await expect(
        service.completeWhatsAppRegistration(
          result.tempToken,
          'Sari',
          'sari2@example.com',
        ),
      ).resolves.toMatchObject({ email: 'sari2@example.com' });
    });

    it('rejects an email-flow temp_token on the whatsapp endpoint', async () => {
      const result = await verifyEmail('baru@example.com');
      if (result.kind !== 'new') throw new Error('unreachable');

      const error = await errorOf(() =>
        service.completeWhatsAppRegistration(
          result.tempToken,
          'S',
          's@example.com',
        ),
      );

      expect(error?.status).toBe(401);
    });
  });
  describe('Google', () => {
    const VERIFIED = {
      email: 'gina@example.com',
      emailVerified: true,
      name: 'Gina Putri',
      picture: 'https://lh3.googleusercontent.com/a/gina',
    };

    beforeEach(() => {
      google.register('valid-token', VERIFIED);
    });

    it('rejects an unknown or invalid id_token with 401 INVALID_GOOGLE_TOKEN', async () => {
      const error = await errorOf(() => service.googleLogin('tidak-valid'));

      expect(error?.status).toBe(401);
      expect(error?.body).toMatchObject({
        error_code: 'INVALID_GOOGLE_TOKEN',
        message: 'Token Google tidak valid',
      });
    });

    it('rejects a token whose Google email is not verified', async () => {
      google.register('unverified', { ...VERIFIED, emailVerified: false });

      const error = await errorOf(() => service.googleLogin('unverified'));

      expect(error?.body).toMatchObject({ error_code: 'INVALID_GOOGLE_TOKEN' });
    });

    it('sends a new Google user to phone completion with name and email, without creating an account', async () => {
      const result = await service.googleLogin('valid-token');

      expect(result).toMatchObject({
        kind: 'new',
        name: 'Gina Putri',
        email: 'gina@example.com',
      });
      expect(users.users.size).toBe(0);
    });

    it('logs an existing user in by email and links auth_provider to google', async () => {
      const existing = users.add({
        email: 'gina@example.com',
        authProvider: 'auto_created',
      });

      const result = await service.googleLogin('valid-token');

      expect(result).toMatchObject({
        kind: 'existing',
        user: { id: existing.id },
      });
      expect(users.users.get(existing.id)?.authProvider).toBe('google');
    });

    it('never logs an admin in through Google', async () => {
      users.add({ email: 'gina@example.com', role: 'admin' });

      const error = await errorOf(() => service.googleLogin('valid-token'));

      expect(error?.body).toMatchObject({ error_code: 'AUTH_FAILED' });
    });

    it('falls back to the email local part when Google provides no name', async () => {
      google.register('no-name', {
        email: 'tanpa.nama@example.com',
        emailVerified: true,
      });

      const result = await service.googleLogin('no-name');

      expect(result).toMatchObject({ kind: 'new', name: 'tanpa.nama' });
    });

    it('creates the user on complete with provider google, Google name, and profile picture', async () => {
      const result = await service.googleLogin('valid-token');
      if (result.kind !== 'new') throw new Error('unreachable');

      const user = await service.completeGoogleRegistration(
        result.tempToken,
        '081234567890',
      );

      expect(user).toMatchObject({
        name: 'Gina Putri',
        email: 'gina@example.com',
        phoneNumber: '081234567890',
        authProvider: 'google',
        profilePicture: 'https://lh3.googleusercontent.com/a/gina',
      });
    });

    it('rejects a taken phone with 409 PHONE_ALREADY_EXISTS and keeps the temp_token usable', async () => {
      users.add({ phoneNumber: '081234567890' });
      const result = await service.googleLogin('valid-token');
      if (result.kind !== 'new') throw new Error('unreachable');

      const error = await errorOf(() =>
        service.completeGoogleRegistration(result.tempToken, '081234567890'),
      );
      expect(error?.status).toBe(409);
      expect(error?.body).toMatchObject({ error_code: 'PHONE_ALREADY_EXISTS' });

      await expect(
        service.completeGoogleRegistration(result.tempToken, '089999999999'),
      ).resolves.toMatchObject({
        phoneNumber: '089999999999',
      });
    });

    it('makes the Google temp_token single-use and rejects tokens from other flows', async () => {
      const result = await service.googleLogin('valid-token');
      if (result.kind !== 'new') throw new Error('unreachable');
      await service.completeGoogleRegistration(
        result.tempToken,
        '081234567890',
      );

      expect(
        (
          await errorOf(() =>
            service.completeGoogleRegistration(
              result.tempToken,
              '089999999999',
            ),
          )
        )?.status,
      ).toBe(401);

      const emailFlow = await verifyEmail('lain@example.com');
      if (emailFlow.kind !== 'new') throw new Error('unreachable');
      expect(
        (
          await errorOf(() =>
            service.completeGoogleRegistration(
              emailFlow.tempToken,
              '087777777777',
            ),
          )
        )?.status,
      ).toBe(401);
    });
  });
});
