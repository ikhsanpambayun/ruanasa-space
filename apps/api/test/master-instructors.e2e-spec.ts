import request from 'supertest';

import { InstructorsRepository } from '../src/modules/instructors/instructors.repository';
import { SpecializationsRepository } from '../src/modules/specializations/specializations.repository';
import {
  createTestApp,
  type AuthHeader,
  type TestApp,
} from './helpers/create-test-app';
import { FakeInstructorsRepository } from './helpers/fake-instructors.repository';
import { FakeSpecializationsRepository } from './helpers/fake-specializations.repository';
import { bodyOf } from './test-env';

const UNKNOWN_ID = '6f1c2f0e-3a53-4f7e-9f1e-0c6f5b7a1d11';

interface Body<T> {
  success: boolean;
  message: string;
  data: T;
}

describe('Instructor API (e2e)', () => {
  let ctx: TestApp;
  let specs: FakeSpecializationsRepository;
  let repo: FakeInstructorsRepository;
  let admin: AuthHeader;
  let vinyasa: string;
  let hatha: string;
  let yin: string;

  const http = (): ReturnType<typeof request> =>
    request(ctx.app.getHttpServer());

  beforeAll(async () => {
    specs = new FakeSpecializationsRepository();
    repo = new FakeInstructorsRepository(specs);
    ctx = await createTestApp({
      configure: (builder) =>
        builder
          .overrideProvider(SpecializationsRepository)
          .useValue(specs)
          .overrideProvider(InstructorsRepository)
          .useValue(repo),
    });
    admin = ctx.asAdmin();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(() => {
    specs.rows.clear();
    repo.rows.clear();
    repo.eventCounts.clear();
    repo.eventLinks.clear();
    repo.detachedTemplatesFor.length = 0;
    vinyasa = specs.seed('Vinyasa Yoga');
    hatha = specs.seed('Hatha Yoga');
    yin = specs.seed('Yin Yoga');
  });

  describe('access control', () => {
    it.each(['/api/v1/admin/instructors', '/api/v1/admin/instructors/active'])(
      '%s requires authentication',
      async (path) => {
        await http().get(path).expect(401);
      },
    );

    it('is forbidden for participants', async () => {
      await http()
        .get('/api/v1/admin/instructors')
        .set(ctx.asParticipant())
        .expect(403);
      await http()
        .post('/api/v1/admin/instructors')
        .set(ctx.asParticipant())
        .send({ name: 'X' })
        .expect(403);
    });
  });

  describe('GET /admin/instructors', () => {
    it('lists instructors by name with specialization names and event_count', async () => {
      const bima = repo.seed({ name: 'Bima', specializationIds: [yin] });
      repo.seed({
        name: 'Ayu',
        specializationIds: [vinyasa, hatha],
        profilePicture: 'https://cdn.example.com/ayu.jpg',
      });
      repo.eventCounts.set(bima, 5);

      const res = await http()
        .get('/api/v1/admin/instructors')
        .set(admin)
        .expect(200);
      const data = (res.body as Body<Record<string, unknown>[]>).data;

      expect(data.map((row) => row.name)).toEqual(['Ayu', 'Bima']);
      expect(data[0]).toEqual({
        id: expect.any(String) as string,
        name: 'Ayu',
        profile_picture: 'https://cdn.example.com/ayu.jpg',
        specializations: ['Hatha Yoga', 'Vinyasa Yoga'],
        status: 'active',
        event_count: 0,
      });
      expect(data[1]).toMatchObject({ name: 'Bima', event_count: 5 });
    });

    it('filters by status and rejects an invalid status with 422', async () => {
      repo.seed({ name: 'Aktif', status: 'active' });
      repo.seed({ name: 'Nonaktif', status: 'inactive' });

      const inactive = await http()
        .get('/api/v1/admin/instructors?status=inactive')
        .set(admin)
        .expect(200);
      expect(
        (inactive.body as Body<{ name: string }[]>).data.map((row) => row.name),
      ).toEqual(['Nonaktif']);

      const bad = await http()
        .get('/api/v1/admin/instructors?status=banned')
        .set(admin)
        .expect(422);
      expect(bodyOf(bad).errors?.status).toBeDefined();
    });
  });

  describe('GET /admin/instructors/active', () => {
    it('returns only active instructors in the compact dropdown shape', async () => {
      repo.seed({
        name: 'Aktif',
        status: 'active',
        specializationIds: [vinyasa],
      });
      repo.seed({ name: 'Nonaktif', status: 'inactive' });

      const res = await http()
        .get('/api/v1/admin/instructors/active')
        .set(admin)
        .expect(200);

      expect((res.body as Body<unknown[]>).data).toEqual([
        {
          id: expect.any(String) as string,
          name: 'Aktif',
          specializations: ['Vinyasa Yoga'],
        },
      ]);
    });
  });

  describe('GET /admin/instructors/:id', () => {
    it('returns the full detail with specialization objects and a WIB timestamp', async () => {
      const id = repo.seed({
        name: 'Ayu',
        bio: 'Instruktur bersertifikat',
        contactInformation: '@ayu',
        specializationIds: [vinyasa],
      });

      const res = await http()
        .get(`/api/v1/admin/instructors/${id}`)
        .set(admin)
        .expect(200);

      expect((res.body as Body<unknown>).data).toEqual({
        id,
        name: 'Ayu',
        profile_picture: null,
        bio: 'Instruktur bersertifikat',
        contact_information: '@ayu',
        specializations: [{ id: vinyasa, name: 'Vinyasa Yoga' }],
        status: 'active',
        event_count: 0,
        created_at: '2026-10-01T10:00:00+07:00',
      });
    });

    it('returns 404 NOT_FOUND for unknown and malformed ids', async () => {
      const unknown = await http()
        .get(`/api/v1/admin/instructors/${UNKNOWN_ID}`)
        .set(admin)
        .expect(404);
      expect(bodyOf(unknown).error_code).toBe('NOT_FOUND');

      await http()
        .get('/api/v1/admin/instructors/bukan-uuid')
        .set(admin)
        .expect(404);
    });
  });

  describe('POST /admin/instructors', () => {
    it('creates an instructor with specializations (201)', async () => {
      const res = await http()
        .post('/api/v1/admin/instructors')
        .set(admin)
        .send({
          name: '  Ayu Prameswari  ',
          profile_picture: 'https://cdn.example.com/ayu.jpg',
          bio: 'Bio singkat',
          contact_information: '@ayu',
          specialization_ids: [vinyasa, yin],
          status: 'inactive',
        })
        .expect(201);
      const body = res.body as Body<Record<string, unknown>>;

      expect(body.message).toBe('Instructor berhasil ditambahkan');
      expect(body.data).toMatchObject({
        name: 'Ayu Prameswari',
        bio: 'Bio singkat',
        status: 'inactive',
        specializations: [
          { id: vinyasa, name: 'Vinyasa Yoga' },
          { id: yin, name: 'Yin Yoga' },
        ],
      });
      expect(repo.rows.size).toBe(1);
    });

    it('applies defaults: status active, no specializations, empty strings become null', async () => {
      const res = await http()
        .post('/api/v1/admin/instructors')
        .set(admin)
        .send({
          name: 'Minimal',
          bio: '   ',
          profile_picture: '',
          contact_information: null,
        })
        .expect(201);

      expect((res.body as Body<unknown>).data).toMatchObject({
        status: 'active',
        specializations: [],
        bio: null,
        profile_picture: null,
        contact_information: null,
      });
    });

    it('rejects an unknown specialization id with 422 and creates nothing', async () => {
      const res = await http()
        .post('/api/v1/admin/instructors')
        .set(admin)
        .send({ name: 'Ayu', specialization_ids: [vinyasa, UNKNOWN_ID] })
        .expect(422);

      expect(bodyOf(res).errors?.specialization_ids).toContain(
        'Specialization tidak ditemukan',
      );
      expect(repo.rows.size).toBe(0);
    });

    it.each([
      ['missing name', {}, 'name'],
      ['blank name', { name: '  ' }, 'name'],
      ['name over 100 chars', { name: 'x'.repeat(101) }, 'name'],
      ['bio over 2000 chars', { name: 'A', bio: 'x'.repeat(2001) }, 'bio'],
      [
        'contact over 500 chars',
        { name: 'A', contact_information: 'x'.repeat(501) },
        'contact_information',
      ],
      [
        'profile picture not a URL',
        { name: 'A', profile_picture: 'bukan url' },
        'profile_picture',
      ],
      [
        'profile picture with javascript: scheme',
        { name: 'A', profile_picture: 'javascript:alert(1)' },
        'profile_picture',
      ],
      [
        'specialization_ids not an array',
        { name: 'A', specialization_ids: 'abc' },
        'specialization_ids',
      ],
      [
        'specialization id not a uuid',
        { name: 'A', specialization_ids: ['123'] },
        'specialization_ids',
      ],
      [
        'duplicate specialization ids',
        { name: 'A', specialization_ids: [UNKNOWN_ID, UNKNOWN_ID] },
        'specialization_ids',
      ],
      ['invalid status', { name: 'A', status: 'banned' }, 'status'],
    ])('rejects %s with 422', async (_label, body, field) => {
      const res = await http()
        .post('/api/v1/admin/instructors')
        .set(admin)
        .send(body)
        .expect(422);

      expect(bodyOf(res).errors?.[field]).toBeDefined();
    });

    it('rejects unknown fields', async () => {
      await http()
        .post('/api/v1/admin/instructors')
        .set(admin)
        .send({ name: 'A', role: 'admin' })
        .expect(422);
    });
  });

  describe('PUT /admin/instructors/:id', () => {
    it('replaces all data including the specialization set', async () => {
      const id = repo.seed({
        name: 'Lama',
        bio: 'Bio lama',
        specializationIds: [vinyasa, hatha],
      });

      const res = await http()
        .put(`/api/v1/admin/instructors/${id}`)
        .set(admin)
        .send({ name: 'Baru', specialization_ids: [yin], status: 'inactive' })
        .expect(200);
      const body = res.body as Body<Record<string, unknown>>;

      expect(body.message).toBe('Instructor berhasil diperbarui');
      expect(body.data).toMatchObject({
        id,
        name: 'Baru',
        status: 'inactive',
        specializations: [{ id: yin, name: 'Yin Yoga' }],
        bio: null, // PUT mengganti seluruh data: field opsional yang tidak dikirim di-reset
      });
    });

    it('keeps the current status when status is omitted (update must not re-activate an inactive instructor)', async () => {
      const id = repo.seed({ name: 'Cuti', status: 'inactive' });

      const res = await http()
        .put(`/api/v1/admin/instructors/${id}`)
        .set(admin)
        .send({ name: 'Cuti' })
        .expect(200);

      expect((res.body as Body<{ status: string }>).data.status).toBe(
        'inactive',
      );
    });

    it('returns 404 for an unknown id and 422 for an unknown specialization', async () => {
      await http()
        .put(`/api/v1/admin/instructors/${UNKNOWN_ID}`)
        .set(admin)
        .send({ name: 'X' })
        .expect(404);

      const id = repo.seed({ name: 'Ayu' });
      const res = await http()
        .put(`/api/v1/admin/instructors/${id}`)
        .set(admin)
        .send({ name: 'Ayu', specialization_ids: [UNKNOWN_ID] })
        .expect(422);
      expect(bodyOf(res).errors?.specialization_ids).toBeDefined();
    });
  });

  describe('DELETE /admin/instructors/:id', () => {
    it('deletes an instructor with no events and detaches templates', async () => {
      const id = repo.seed({ name: 'Bebas', specializationIds: [vinyasa] });

      const res = await http()
        .delete(`/api/v1/admin/instructors/${id}`)
        .set(admin)
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        message: 'Instructor berhasil dihapus',
      });
      expect(repo.rows.has(id)).toBe(false);
      expect(repo.detachedTemplatesFor).toEqual([id]);
    });

    it('blocks deletion with 403 INSTRUCTOR_HAS_ACTIVE_EVENT when a draft or published event exists', async () => {
      const id = repo.seed({ name: 'Sibuk' });
      repo.eventLinks.set(id, { activeEvents: 1, totalEvents: 1 });

      const res = await http()
        .delete(`/api/v1/admin/instructors/${id}`)
        .set(admin)
        .expect(403);

      expect(bodyOf(res)).toEqual({
        success: false,
        message:
          'Tidak dapat menghapus instructor yang terhubung dengan event aktif',
        error_code: 'INSTRUCTOR_HAS_ACTIVE_EVENT',
      });
      expect(repo.rows.has(id)).toBe(true);
    });

    it('also blocks deletion when the instructor only has past (completed) events, keeping history intact', async () => {
      const id = repo.seed({ name: 'Senior' });
      repo.eventLinks.set(id, { activeEvents: 0, totalEvents: 3 });

      const res = await http()
        .delete(`/api/v1/admin/instructors/${id}`)
        .set(admin)
        .expect(403);

      expect(bodyOf(res).error_code).toBe('INSTRUCTOR_HAS_ACTIVE_EVENT');
      expect(bodyOf(res).message).toContain('Nonaktifkan instructor');
      expect(repo.rows.has(id)).toBe(true);
    });

    it('returns 404 for an unknown id', async () => {
      await http()
        .delete(`/api/v1/admin/instructors/${UNKNOWN_ID}`)
        .set(admin)
        .expect(404);
    });
  });
});
