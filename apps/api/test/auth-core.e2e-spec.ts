import { Controller, Get } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { Public } from '../src/common/decorators/public.decorator';
import { CurrentUser } from '../src/modules/auth/decorators/current-user.decorator';
import { Roles } from '../src/modules/auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../src/modules/auth/auth.types';
import { TokenService } from '../src/modules/auth/token.service';
import { createTestApp, type TestApp } from './helpers/create-test-app';
import { bodyOf } from './test-env';

@Controller('probe')
class AuthProbeController {
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Get('my-id')
  myId(@CurrentUser('id') id: string): { id: string } {
    return { id };
  }

  @Get('admin-only')
  @Roles('admin')
  adminOnly(): { ok: boolean } {
    return { ok: true };
  }

  @Get('participant-only')
  @Roles('participant')
  participantOnly(): { ok: boolean } {
    return { ok: true };
  }

  @Get('any-role')
  anyRole(): { ok: boolean } {
    return { ok: true };
  }

  @Public()
  @Get('public')
  publicRoute(): { ok: boolean } {
    return { ok: true };
  }
}

/**
 * Mengambil nilai header Set-Cookie sebagai array string.
 *
 * @param res - Response supertest.
 * @returns Daftar cookie.
 */
function setCookies(res: { headers: Record<string, unknown> }): string[] {
  const value = res.headers['set-cookie'];
  return Array.isArray(value) ? (value as string[]) : [];
}

describe('JWT core and role authorization (e2e)', () => {
  let ctx: TestApp;
  let tokens: TokenService;
  let jwt: JwtService;
  let participantId: string;
  let adminId: string;
  let participantToken: string;
  let adminToken: string;

  const http = (): ReturnType<typeof request> =>
    request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp({ controllers: [AuthProbeController] });
    tokens = ctx.module.get(TokenService);
    jwt = ctx.module.get(JwtService, { strict: false });

    participantId = ctx.users.add({ role: 'participant' }).id;
    adminId = ctx.users.add({ role: 'admin' }).id;
    participantToken = tokens.signAccessToken({
      id: participantId,
      role: 'participant',
    }).token;
    adminToken = tokens.signAccessToken({ id: adminId, role: 'admin' }).token;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('token generation', () => {
    it('signs HS256 tokens with payload { sub, role, iat, exp } and a 7-day expiry', () => {
      const [header, body] = participantToken.split('.') as [string, string];
      const decodedHeader = JSON.parse(
        Buffer.from(header, 'base64url').toString(),
      ) as { alg: string };
      const payload = JSON.parse(
        Buffer.from(body, 'base64url').toString(),
      ) as Record<string, unknown>;

      expect(decodedHeader.alg).toBe('HS256');
      expect(Object.keys(payload).sort()).toEqual([
        'exp',
        'iat',
        'role',
        'sub',
      ]);
      expect(payload.sub).toBe(participantId);
      expect(payload.role).toBe('participant');
      expect((payload.exp as number) - (payload.iat as number)).toBe(
        7 * 24 * 60 * 60,
      );
    });
  });

  describe('authentication', () => {
    it('rejects a request without a token with 401 UNAUTHORIZED', async () => {
      const res = await http().get('/api/v1/probe/me').expect(401);

      expect(bodyOf(res)).toMatchObject({
        success: false,
        error_code: 'UNAUTHORIZED',
        message: 'Token tidak valid atau expired',
      });
    });

    it('accepts a token from the Authorization Bearer header', async () => {
      const res = await http()
        .get('/api/v1/probe/me')
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(200);

      expect(bodyOf(res).data).toEqual({
        id: participantId,
        role: 'participant',
      });
    });

    it('accepts a token from the httpOnly cookie', async () => {
      const res = await http()
        .get('/api/v1/probe/me')
        .set('Cookie', `token=${participantToken}`)
        .expect(200);

      expect(bodyOf(res).data).toEqual({
        id: participantId,
        role: 'participant',
      });
    });

    it('prefers the cookie over the Bearer header when both are present', async () => {
      const res = await http()
        .get('/api/v1/probe/me')
        .set('Cookie', `token=${participantToken}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(bodyOf(res).data).toEqual({
        id: participantId,
        role: 'participant',
      });
    });

    it('exposes the user through @CurrentUser() and @CurrentUser("id")', async () => {
      const res = await http()
        .get('/api/v1/probe/my-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(bodyOf(res).data).toEqual({ id: adminId });
    });

    it('rejects an expired token with 401', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expired = jwt.sign({
        sub: participantId,
        role: 'participant',
        iat: now - 100,
        exp: now - 10,
      });

      const res = await http()
        .get('/api/v1/probe/me')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);

      expect(bodyOf(res).error_code).toBe('UNAUTHORIZED');
    });

    it('rejects a token with a tampered signature', async () => {
      const tampered = `${participantToken.slice(0, -4)}AAAA`;

      await http()
        .get('/api/v1/probe/me')
        .set('Authorization', `Bearer ${tampered}`)
        .expect(401);
    });

    it('rejects a token signed with a different secret', async () => {
      const foreign = new JwtService({
        secret: 'another-secret-another-secret-123456',
      }).sign({
        sub: participantId,
        role: 'admin',
      });

      await http()
        .get('/api/v1/probe/admin-only')
        .set('Authorization', `Bearer ${foreign}`)
        .expect(401);
    });

    it('rejects an unsigned token (alg: none)', async () => {
      const header = Buffer.from(
        JSON.stringify({ alg: 'none', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ sub: adminId, role: 'admin' }),
      ).toString('base64url');

      await http()
        .get('/api/v1/probe/admin-only')
        .set('Authorization', `Bearer ${header}.${payload}.`)
        .expect(401);
    });

    it('rejects a registration temp_token used as an access token', async () => {
      const temp = tokens.signTempToken('email_complete', {
        email: 'x@example.com',
      });

      await http()
        .get('/api/v1/probe/me')
        .set('Authorization', `Bearer ${temp}`)
        .expect(401);
    });

    it('rejects a valid token whose user no longer exists', async () => {
      const ghost = tokens.signAccessToken({
        id: '00000000-0000-4000-8000-000000000000',
        role: 'participant',
      });

      await http()
        .get('/api/v1/probe/me')
        .set('Authorization', `Bearer ${ghost.token}`)
        .expect(401);
    });

    it('allows @Public() routes without a token', async () => {
      await http().get('/api/v1/probe/public').expect(200);
    });
  });

  describe('sliding window', () => {
    it('sends a fresh token via cookie and X-Refreshed-Token on authenticated requests', async () => {
      const res = await http()
        .get('/api/v1/probe/me')
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(200);

      const refreshed = res.headers['x-refreshed-token'];
      expect(typeof refreshed).toBe('string');

      const cookie = setCookies(res).find((c) => c.startsWith('token='));
      expect(cookie).toBeDefined();
      expect(cookie).toContain(`token=${refreshed}`);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
      // Secure aktif di luar development/test (lihat TokenService.cookieOptions).
      expect(cookie).not.toContain('Secure');

      await http()
        .get('/api/v1/probe/me')
        .set('Authorization', `Bearer ${refreshed}`)
        .expect(200);
    });

    it('does not set a session cookie on public routes', async () => {
      const res = await http().get('/api/v1/probe/public').expect(200);

      expect(setCookies(res)).toEqual([]);
      expect(res.headers['x-refreshed-token']).toBeUndefined();
    });
  });

  describe('role-based authorization', () => {
    it('lets admin reach admin-only endpoints and blocks participant with 403', async () => {
      await http()
        .get('/api/v1/probe/admin-only')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const res = await http()
        .get('/api/v1/probe/admin-only')
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(403);
      expect(bodyOf(res)).toMatchObject({
        success: false,
        error_code: 'FORBIDDEN',
      });
    });

    it('lets participant reach participant-only endpoints and blocks admin with 403', async () => {
      await http()
        .get('/api/v1/probe/participant-only')
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(200);

      const res = await http()
        .get('/api/v1/probe/participant-only')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
      expect(bodyOf(res).error_code).toBe('FORBIDDEN');
    });

    it('lets any authenticated user reach endpoints without @Roles', async () => {
      await http()
        .get('/api/v1/probe/any-role')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await http()
        .get('/api/v1/probe/any-role')
        .set('Authorization', `Bearer ${participantToken}`)
        .expect(200);
    });

    it('still returns 401 (not 403) for anonymous requests to role-protected endpoints', async () => {
      await http().get('/api/v1/probe/admin-only').expect(401);
    });

    it('uses the role stored in the database, not the one claimed in the token', async () => {
      const demoted = ctx.users.add({ role: 'participant' });
      const staleAdminToken = tokens.signAccessToken({
        id: demoted.id,
        role: 'admin',
      }).token;

      await http()
        .get('/api/v1/probe/admin-only')
        .set('Authorization', `Bearer ${staleAdminToken}`)
        .expect(403);
    });
  });

  describe('logout', () => {
    it('blacklists the token, clears the cookie, and does not refresh the session', async () => {
      const token = tokens.signAccessToken({
        id: participantId,
        role: 'participant',
      }).token;

      const res = await http()
        .post('/api/v1/auth/logout')
        .set('Cookie', `token=${token}`)
        .expect(200);

      expect(bodyOf(res)).toMatchObject({
        success: true,
        message: 'Logout berhasil',
      });
      const cleared = setCookies(res).filter((c) => c.startsWith('token='));
      expect(cleared).toHaveLength(1);
      expect(cleared[0]).toMatch(/token=;/);
      expect(cleared[0]).toContain('Expires=Thu, 01 Jan 1970');
      expect(res.headers['x-refreshed-token']).toBeUndefined();

      const after = await http()
        .get('/api/v1/probe/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      expect(bodyOf(after).error_code).toBe('UNAUTHORIZED');
    });

    it('requires authentication', async () => {
      await http().post('/api/v1/auth/logout').expect(401);
    });

    it('does not invalidate other tokens of the same user', async () => {
      const first = tokens.signAccessToken({
        id: adminId,
        role: 'admin',
      }).token;
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const second = tokens.signAccessToken({
        id: adminId,
        role: 'admin',
      }).token;
      expect(second).not.toBe(first);

      await http()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${first}`)
        .expect(200);

      await http()
        .get('/api/v1/probe/me')
        .set('Authorization', `Bearer ${second}`)
        .expect(200);
    });
  });
});
