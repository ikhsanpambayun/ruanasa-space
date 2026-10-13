import request from 'supertest';

import type { EventHistoryRow } from '../src/modules/users/users.repository';
import {
  createTestApp,
  type AuthHeader,
  type TestApp,
} from './helpers/create-test-app';
import { bodyOf } from './test-env';

interface Body<T> {
  success: boolean;
  message: string;
  data: T;
  pagination?: { page: number; per_page: number; total_items: number };
}

describe('User profile API (e2e)', () => {
  let ctx: TestApp;

  const http = (): ReturnType<typeof request> =>
    request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('access control', () => {
    it.each([
      ['GET', '/api/v1/users/profile'],
      ['PUT', '/api/v1/users/profile'],
      ['GET', '/api/v1/users/event-history'],
    ])(
      '%s %s requires authentication and the participant role',
      async (method, path) => {
        const call = (): request.Test =>
          method === 'GET'
            ? http().get(path)
            : http().put(path).send({
                name: 'x',
                email: 'x@example.com',
                phone_number: '081234567890',
              });

        await call().expect(401);
        await call().set(ctx.asAdmin()).expect(403);
      },
    );
  });

  describe('GET /users/profile', () => {
    it('returns the profile with exactly the documented fields (no password hash, no role)', async () => {
      const auth = ctx.asParticipant({
        name: 'Budi',
        email: 'budi@example.com',
        phoneNumber: '081234567890',
        authProvider: 'google',
        profilePicture: 'https://example.com/p.png',
        passwordHash: 'hash-yang-tidak-boleh-bocor',
        createdAt: new Date('2026-10-01T03:00:00Z'),
      });

      const res = await http()
        .get('/api/v1/users/profile')
        .set(auth)
        .expect(200);
      const data = (res.body as Body<Record<string, unknown>>).data;

      expect(Object.keys(data).sort()).toEqual(
        [
          'auth_provider',
          'created_at',
          'email',
          'id',
          'name',
          'phone_number',
          'profile_picture',
        ].sort(),
      );
      expect(data).toMatchObject({
        name: 'Budi',
        email: 'budi@example.com',
        phone_number: '081234567890',
        profile_picture: 'https://example.com/p.png',
        auth_provider: 'google',
        created_at: '2026-10-01T10:00:00+07:00',
      });
      expect(JSON.stringify(res.body)).not.toContain(
        'hash-yang-tidak-boleh-bocor',
      );
    });
  });

  describe('PUT /users/profile', () => {
    let auth: AuthHeader;
    let userId: string;

    beforeEach(() => {
      ctx.users.users.clear();
      const user = ctx.users.add({
        name: 'Lama',
        email: 'lama@example.com',
        phoneNumber: '081111111111',
      });
      userId = user.id;
      auth = ctx.asParticipant({
        id: userId,
        name: 'Lama',
        email: 'lama@example.com',
        phoneNumber: '081111111111',
      });
    });

    const body = (
      override: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      name: 'Baru',
      email: 'baru@example.com',
      phone_number: '082222222222',
      ...override,
    });

    it('updates name, email, and phone, normalizing the input', async () => {
      const res = await http()
        .put('/api/v1/users/profile')
        .set(auth)
        .send(
          body({
            name: '  Budi Baru ',
            email: 'BARU@Example.com',
            phone_number: '+62 822-2222-2222',
          }),
        )
        .expect(200);
      const data = res.body as Body<Record<string, unknown>>;

      expect(data.message).toBe('Profil berhasil diperbarui');
      expect(data.data).toMatchObject({
        id: userId,
        name: 'Budi Baru',
        email: 'baru@example.com',
        phone_number: '082222222222',
      });
      expect(ctx.users.users.get(userId)).toMatchObject({
        email: 'baru@example.com',
        phoneNumber: '082222222222',
      });
    });

    it("does not treat the user's own current phone and email as conflicts", async () => {
      await http()
        .put('/api/v1/users/profile')
        .set(auth)
        .send(
          body({
            email: 'lama@example.com',
            phone_number: '081111111111',
            name: 'Nama Saja Berubah',
          }),
        )
        .expect(200);
    });

    it('rejects a phone number used by another account with 409 PHONE_ALREADY_EXISTS', async () => {
      ctx.users.add({ phoneNumber: '082222222222', email: 'lain@example.com' });

      const res = await http()
        .put('/api/v1/users/profile')
        .set(auth)
        .send(body())
        .expect(409);

      expect(bodyOf(res)).toEqual({
        success: false,
        message: 'Nomor telepon sudah digunakan akun lain',
        error_code: 'PHONE_ALREADY_EXISTS',
      });
      expect(ctx.users.users.get(userId)?.phoneNumber).toBe('081111111111');
    });

    it('rejects an email used by another account with 409 EMAIL_ALREADY_EXISTS', async () => {
      ctx.users.add({ phoneNumber: '083333333333', email: 'baru@example.com' });

      const res = await http()
        .put('/api/v1/users/profile')
        .set(auth)
        .send(body())
        .expect(409);

      expect(bodyOf(res)).toEqual({
        success: false,
        message: 'Email sudah digunakan akun lain',
        error_code: 'EMAIL_ALREADY_EXISTS',
      });
      expect(ctx.users.users.get(userId)?.email).toBe('lama@example.com');
    });

    it('checks the phone before the email when both conflict', async () => {
      ctx.users.add({ phoneNumber: '082222222222', email: 'x@example.com' });
      ctx.users.add({ phoneNumber: '083333333333', email: 'baru@example.com' });

      const res = await http()
        .put('/api/v1/users/profile')
        .set(auth)
        .send(body())
        .expect(409);

      expect(bodyOf(res).error_code).toBe('PHONE_ALREADY_EXISTS');
    });

    it('also treats identifiers of soft-deleted accounts as taken (unique constraint spans deleted rows)', async () => {
      ctx.users.add({
        phoneNumber: '082222222222',
        email: 'hapus@example.com',
        deletedAt: new Date(),
      });

      const res = await http()
        .put('/api/v1/users/profile')
        .set(auth)
        .send(body())
        .expect(409);

      expect(bodyOf(res).error_code).toBe('PHONE_ALREADY_EXISTS');
    });

    it.each([
      ['missing name', { name: undefined }, 'name'],
      ['blank name', { name: '   ' }, 'name'],
      ['bad email', { email: 'bukan-email' }, 'email'],
      ['bad phone', { phone_number: '12345' }, 'phone_number'],
      ['missing phone', { phone_number: undefined }, 'phone_number'],
    ])('rejects %s with 422', async (_label, override, field) => {
      const res = await http()
        .put('/api/v1/users/profile')
        .set(auth)
        .send(body(override))
        .expect(422);

      expect(bodyOf(res).errors?.[field]).toBeDefined();
    });

    it.each([
      ['role', 'admin'],
      ['auth_provider', 'google'],
      ['password_hash', 'x'],
      ['id', 'abc'],
      ['profile_picture', 'https://x.test/a.png'],
    ])(
      'rejects the protected field "%s" (no mass assignment)',
      async (field, value) => {
        await http()
          .put('/api/v1/users/profile')
          .set(auth)
          .send(body({ [field]: value }))
          .expect(422);

        expect(ctx.users.users.get(userId)?.role).toBe('participant');
      },
    );
  });

  describe('GET /users/event-history', () => {
    const row = (
      name: string,
      attendanceStatus: 'present' | 'not_checked',
      date: string | null,
    ): EventHistoryRow => ({
      eventId: `00000000-0000-4000-8000-${name.padStart(12, '0')}`,
      eventName: `Event ${name}`,
      activityType: 'yoga',
      date: date ? new Date(`${date}T00:00:00Z`) : null,
      location: 'Ruanasa Studio',
      attendanceStatus,
    });

    it('returns an empty paginated list for a user without history', async () => {
      const res = await http()
        .get('/api/v1/users/event-history')
        .set(ctx.asParticipant())
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        data: [],
        pagination: { page: 1, per_page: 20, total_items: 0 },
      });
    });

    it('returns the documented item shape with attendance status and paginates', async () => {
      const user = ctx.users.add({ role: 'participant' });
      const auth = ctx.asParticipant({ id: user.id });
      ctx.users.history.set(user.id, [
        row('3', 'not_checked', '2026-12-01'),
        row('2', 'present', '2026-11-01'),
        row('1', 'present', null),
      ]);

      const first = await http()
        .get('/api/v1/users/event-history?page=1&per_page=2')
        .set(auth)
        .expect(200);
      const firstBody = first.body as Body<Record<string, unknown>[]>;

      expect(firstBody.data).toHaveLength(2);
      expect(firstBody.data[0]).toEqual({
        event_id: '00000000-0000-4000-8000-000000000003',
        event_name: 'Event 3',
        activity_type: 'yoga',
        date: '2026-12-01',
        location: 'Ruanasa Studio',
        attendance_status: 'not_checked',
        registration_status: 'confirmed',
      });
      expect(firstBody.pagination).toEqual({
        page: 1,
        per_page: 2,
        total_items: 3,
      });

      const second = await http()
        .get('/api/v1/users/event-history?page=2&per_page=2')
        .set(auth)
        .expect(200);
      const secondBody = second.body as Body<Record<string, unknown>[]>;
      expect(secondBody.data).toHaveLength(1);
      expect(secondBody.data[0]).toMatchObject({
        event_name: 'Event 1',
        date: null,
        attendance_status: 'present',
      });
    });

    it('only returns the history of the authenticated user', async () => {
      const mine = ctx.users.add({ role: 'participant' });
      const other = ctx.users.add({ role: 'participant' });
      ctx.users.history.set(mine.id, [row('1', 'present', '2026-11-01')]);
      ctx.users.history.set(other.id, [
        row('9', 'present', '2026-11-02'),
        row('8', 'present', '2026-11-03'),
      ]);

      const res = await http()
        .get('/api/v1/users/event-history')
        .set(ctx.asParticipant({ id: mine.id }))
        .expect(200);

      expect((res.body as Body<unknown[]>).data).toHaveLength(1);
    });

    it.each(['page=0', 'per_page=0', 'per_page=500', 'page=x'])(
      'rejects ?%s with 422',
      async (query) => {
        await http()
          .get(`/api/v1/users/event-history?${query}`)
          .set(ctx.asParticipant())
          .expect(422);
      },
    );
  });
});
