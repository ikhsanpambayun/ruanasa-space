import request from 'supertest';

import { SpecializationsRepository } from '../src/modules/specializations/specializations.repository';
import { createTestApp, type TestApp } from './helpers/create-test-app';
import { FakeSpecializationsRepository } from './helpers/fake-specializations.repository';
import { bodyOf } from './test-env';

interface ListBody {
  message: string;
  data: { id: string; name: string; instructor_count: number }[];
}

describe('Specialization API (e2e)', () => {
  let ctx: TestApp;
  let repo: FakeSpecializationsRepository;
  let admin: { Authorization: string };

  const http = (): ReturnType<typeof request> =>
    request(ctx.app.getHttpServer());

  beforeAll(async () => {
    repo = new FakeSpecializationsRepository();
    ctx = await createTestApp({
      configure: (builder) =>
        builder.overrideProvider(SpecializationsRepository).useValue(repo),
    });
    admin = ctx.asAdmin();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(() => {
    repo.rows.clear();
    repo.instructorCounts.clear();
  });

  describe('access control', () => {
    it('requires authentication (401)', async () => {
      await http().get('/api/v1/admin/specializations').expect(401);
    });

    it('is forbidden for participants (403)', async () => {
      const res = await http()
        .get('/api/v1/admin/specializations')
        .set(ctx.asParticipant())
        .expect(403);

      expect(bodyOf(res).error_code).toBe('FORBIDDEN');
    });
  });

  describe('GET /admin/specializations', () => {
    it('lists specializations sorted by name with instructor_count', async () => {
      repo.seed('Yin Yoga', 1);
      repo.seed('Hatha Yoga', 3);
      repo.seed('Vinyasa Yoga');

      const res = await http()
        .get('/api/v1/admin/specializations')
        .set(admin)
        .expect(200);
      const body = res.body as ListBody;

      expect(body.data.map((row) => row.name)).toEqual([
        'Hatha Yoga',
        'Vinyasa Yoga',
        'Yin Yoga',
      ]);
      expect(body.data.map((row) => row.instructor_count)).toEqual([3, 0, 1]);
    });

    it('returns an empty list when there is no data', async () => {
      const res = await http()
        .get('/api/v1/admin/specializations')
        .set(admin)
        .expect(200);

      expect((res.body as ListBody).data).toEqual([]);
    });
  });

  describe('POST /admin/specializations', () => {
    it('creates a specialization (201) and trims the name', async () => {
      const res = await http()
        .post('/api/v1/admin/specializations')
        .set(admin)
        .send({ name: '  Meditation  ' })
        .expect(201);

      expect(res.body).toMatchObject({
        success: true,
        message: 'Specialization berhasil ditambahkan',
        data: { name: 'Meditation', instructor_count: 0 },
      });
      expect(repo.rows.size).toBe(1);
    });

    it('rejects a duplicate name regardless of letter case with 409 SPECIALIZATION_EXISTS', async () => {
      repo.seed('Vinyasa Yoga');

      const res = await http()
        .post('/api/v1/admin/specializations')
        .set(admin)
        .send({ name: 'vinyasa yoga' })
        .expect(409);

      expect(bodyOf(res)).toEqual({
        success: false,
        message: 'Specialization sudah ada',
        error_code: 'SPECIALIZATION_EXISTS',
      });
      expect(repo.rows.size).toBe(1);
    });

    it.each([
      ['empty name', { name: '' }],
      ['whitespace only', { name: '   ' }],
      ['missing name', {}],
      ['name over 100 characters', { name: 'x'.repeat(101) }],
      ['unknown field', { name: 'Ok', extra: 1 }],
    ])('rejects %s with 422', async (_label, body) => {
      const res = await http()
        .post('/api/v1/admin/specializations')
        .set(admin)
        .send(body)
        .expect(422);

      expect(bodyOf(res).error_code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /admin/specializations/:id', () => {
    it('renames a specialization', async () => {
      const id = repo.seed('Hatha');

      const res = await http()
        .put(`/api/v1/admin/specializations/${id}`)
        .set(admin)
        .send({ name: 'Hatha Yoga' })
        .expect(200);

      expect(res.body).toMatchObject({
        message: 'Specialization berhasil diperbarui',
        data: { id, name: 'Hatha Yoga' },
      });
    });

    it('allows changing only the letter case of its own name', async () => {
      const id = repo.seed('yin yoga');

      await http()
        .put(`/api/v1/admin/specializations/${id}`)
        .set(admin)
        .send({ name: 'Yin Yoga' })
        .expect(200);
    });

    it('rejects a name used by another specialization with 409', async () => {
      repo.seed('Yin Yoga');
      const id = repo.seed('Hatha Yoga');

      const res = await http()
        .put(`/api/v1/admin/specializations/${id}`)
        .set(admin)
        .send({ name: 'YIN YOGA' })
        .expect(409);

      expect(bodyOf(res).error_code).toBe('SPECIALIZATION_EXISTS');
    });

    it('returns 404 NOT_FOUND for an unknown id and for a malformed id', async () => {
      const unknown = await http()
        .put(
          '/api/v1/admin/specializations/6f1c2f0e-3a53-4f7e-9f1e-0c6f5b7a1d11',
        )
        .set(admin)
        .send({ name: 'X' })
        .expect(404);
      expect(bodyOf(unknown).error_code).toBe('NOT_FOUND');

      await http()
        .put('/api/v1/admin/specializations/bukan-uuid')
        .set(admin)
        .send({ name: 'X' })
        .expect(404);
    });
  });

  describe('DELETE /admin/specializations/:id', () => {
    it('deletes a specialization', async () => {
      const id = repo.seed('Sound Healing', 2);

      const res = await http()
        .delete(`/api/v1/admin/specializations/${id}`)
        .set(admin)
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        message: 'Specialization berhasil dihapus',
      });
      expect(repo.rows.has(id)).toBe(false);
    });

    it('returns 404 for an unknown id', async () => {
      await http()
        .delete(
          '/api/v1/admin/specializations/6f1c2f0e-3a53-4f7e-9f1e-0c6f5b7a1d11',
        )
        .set(admin)
        .expect(404);
    });
  });
});
