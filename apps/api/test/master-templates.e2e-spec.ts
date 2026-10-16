import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { InstructorsRepository } from '../src/modules/instructors/instructors.repository';
import { TemplatesRepository } from '../src/modules/templates/templates.repository';
import {
  createTestApp,
  type AuthHeader,
  type TestApp,
} from './helpers/create-test-app';
import { FakeInstructorsRepository } from './helpers/fake-instructors.repository';
import { FakeSpecializationsRepository } from './helpers/fake-specializations.repository';
import { FakeTemplatesRepository } from './helpers/fake-templates.repository';
import { bodyOf } from './test-env';

interface Body<T> {
  success: boolean;
  message: string;
  data: T;
}

describe('Event template API (e2e)', () => {
  let ctx: TestApp;
  let instructors: FakeInstructorsRepository;
  let templates: FakeTemplatesRepository;
  let admin: AuthHeader;
  let activeInstructor: string;
  let inactiveInstructor: string;

  const http = (): ReturnType<typeof request> =>
    request(ctx.app.getHttpServer());

  beforeAll(async () => {
    instructors = new FakeInstructorsRepository(
      new FakeSpecializationsRepository(),
    );
    templates = new FakeTemplatesRepository(instructors);
    ctx = await createTestApp({
      configure: (builder) =>
        builder
          .overrideProvider(InstructorsRepository)
          .useValue(instructors)
          .overrideProvider(TemplatesRepository)
          .useValue(templates),
    });
    admin = ctx.asAdmin();
    activeInstructor = instructors.seed({ name: 'Ayu', status: 'active' });
    inactiveInstructor = instructors.seed({ name: 'Cuti', status: 'inactive' });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(() => {
    templates.rows.clear();
  });

  it('requires an admin for every endpoint', async () => {
    const id = randomUUID();
    for (const [method, path] of [
      ['get', '/api/v1/admin/event-templates'],
      ['get', `/api/v1/admin/event-templates/${id}`],
      ['post', '/api/v1/admin/event-templates'],
      ['put', `/api/v1/admin/event-templates/${id}`],
      ['delete', `/api/v1/admin/event-templates/${id}`],
    ] as const) {
      await http()[method](path).expect(401);
      await http()[method](path).set(ctx.asParticipant()).expect(403);
    }
  });

  describe('GET /admin/event-templates', () => {
    it('lists templates newest first with the instructor name (null when none)', async () => {
      templates.seed({ name: 'Lama' });
      templates.seed({ name: 'Baru', instructorId: activeInstructor });

      const res = await http()
        .get('/api/v1/admin/event-templates')
        .set(admin)
        .expect(200);
      const data = (res.body as Body<Record<string, unknown>[]>).data;

      expect(data.map((row) => row.name)).toEqual(['Baru', 'Lama']);
      expect(data[0]).toEqual({
        id: expect.any(String) as string,
        name: 'Baru',
        activity_type: 'yoga',
        instructor_name: 'Ayu',
        created_at: expect.stringMatching(/\+07:00$/) as string,
      });
      expect(data[1]).toMatchObject({ instructor_name: null });
    });
  });

  describe('GET /admin/event-templates/:id', () => {
    it('returns the detail', async () => {
      const row = templates.seed({
        name: 'Vinyasa',
        description: 'Deskripsi',
        instructorId: activeInstructor,
      });

      const res = await http()
        .get(`/api/v1/admin/event-templates/${row.id}`)
        .set(admin)
        .expect(200);

      expect((res.body as Body<unknown>).data).toMatchObject({
        id: row.id,
        name: 'Vinyasa',
        activity_type: 'yoga',
        description: 'Deskripsi',
        instructor_id: activeInstructor,
        instructor_name: 'Ayu',
      });
    });

    it('returns 404 NOT_FOUND for unknown and malformed ids', async () => {
      const res = await http()
        .get(`/api/v1/admin/event-templates/${randomUUID()}`)
        .set(admin)
        .expect(404);
      expect(bodyOf(res).error_code).toBe('NOT_FOUND');
      await http()
        .get('/api/v1/admin/event-templates/abc')
        .set(admin)
        .expect(404);
    });
  });

  describe('POST /admin/event-templates', () => {
    it('creates a template (201) with only name, activity type, description, and instructor', async () => {
      const res = await http()
        .post('/api/v1/admin/event-templates')
        .set(admin)
        .send({
          name: '  Yin Yoga Malam ',
          activity_type: 'yoga',
          description: 'Santai',
          instructor_id: activeInstructor,
        })
        .expect(201);
      const body = res.body as Body<Record<string, unknown>>;

      expect(body.message).toBe('Template berhasil dibuat');
      expect(body.data).toMatchObject({
        name: 'Yin Yoga Malam',
        description: 'Santai',
        instructor_id: activeInstructor,
        instructor_name: 'Ayu',
      });
      expect(Object.keys(body.data).sort()).toEqual(
        [
          'activity_type',
          'created_at',
          'description',
          'id',
          'instructor_id',
          'instructor_name',
          'name',
        ].sort(),
      );
    });

    it('accepts a template without description and instructor', async () => {
      const res = await http()
        .post('/api/v1/admin/event-templates')
        .set(admin)
        .send({ name: 'Minimal', activity_type: 'yoga' })
        .expect(201);

      expect((res.body as Body<unknown>).data).toMatchObject({
        description: null,
        instructor_id: null,
        instructor_name: null,
      });
    });

    it('rejects an unknown or inactive instructor with 422', async () => {
      for (const instructorId of [randomUUID(), inactiveInstructor]) {
        const res = await http()
          .post('/api/v1/admin/event-templates')
          .set(admin)
          .send({
            name: 'X',
            activity_type: 'yoga',
            instructor_id: instructorId,
          })
          .expect(422);
        expect(bodyOf(res).errors?.instructor_id).toContain(
          'Instructor tidak ditemukan atau tidak aktif',
        );
      }
      expect(templates.rows.size).toBe(0);
    });

    it.each([
      ['missing name', { activity_type: 'yoga' }, 'name'],
      ['blank name', { name: ' ', activity_type: 'yoga' }, 'name'],
      [
        'name over 150',
        { name: 'x'.repeat(151), activity_type: 'yoga' },
        'name',
      ],
      ['missing activity_type', { name: 'X' }, 'activity_type'],
      [
        'activity_type over 50',
        { name: 'X', activity_type: 'x'.repeat(51) },
        'activity_type',
      ],
      [
        'description over 5000',
        { name: 'X', activity_type: 'yoga', description: 'x'.repeat(5001) },
        'description',
      ],
      [
        'instructor_id not a uuid',
        { name: 'X', activity_type: 'yoga', instructor_id: '1' },
        'instructor_id',
      ],
    ])('rejects %s with 422', async (_label, body, field) => {
      const res = await http()
        .post('/api/v1/admin/event-templates')
        .set(admin)
        .send(body)
        .expect(422);

      expect(bodyOf(res).errors?.[field]).toBeDefined();
    });

    it('does not accept pricing or add-ons (templates never store them)', async () => {
      for (const extra of [
        { price: 100000 },
        { addons: [] },
        { prices: [] },
        { capacity: 10 },
      ]) {
        await http()
          .post('/api/v1/admin/event-templates')
          .set(admin)
          .send({ name: 'X', activity_type: 'yoga', ...extra })
          .expect(422);
      }
    });
  });

  describe('PUT /admin/event-templates/:id', () => {
    it('replaces all data; omitted description and instructor are reset', async () => {
      const row = templates.seed({
        name: 'Lama',
        description: 'Deskripsi lama',
        instructorId: activeInstructor,
      });

      const res = await http()
        .put(`/api/v1/admin/event-templates/${row.id}`)
        .set(admin)
        .send({ name: 'Baru', activity_type: 'meditation' })
        .expect(200);

      expect((res.body as Body<unknown>).data).toMatchObject({
        name: 'Baru',
        activity_type: 'meditation',
        description: null,
        instructor_id: null,
        instructor_name: null,
      });
    });

    it('validates a new instructor but lets an existing inactive instructor stay', async () => {
      const row = templates.seed({
        name: 'T',
        instructorId: inactiveInstructor,
      });

      await http()
        .put(`/api/v1/admin/event-templates/${row.id}`)
        .set(admin)
        .send({
          name: 'T2',
          activity_type: 'yoga',
          instructor_id: inactiveInstructor,
        })
        .expect(200);

      const bad = await http()
        .put(`/api/v1/admin/event-templates/${row.id}`)
        .set(admin)
        .send({
          name: 'T2',
          activity_type: 'yoga',
          instructor_id: randomUUID(),
        })
        .expect(422);
      expect(bodyOf(bad).errors?.instructor_id).toBeDefined();
    });

    it('returns 404 for an unknown template', async () => {
      await http()
        .put(`/api/v1/admin/event-templates/${randomUUID()}`)
        .set(admin)
        .send({ name: 'X', activity_type: 'yoga' })
        .expect(404);
    });
  });

  describe('DELETE /admin/event-templates/:id', () => {
    it('deletes a template', async () => {
      const row = templates.seed({ name: 'Hapus' });

      const res = await http()
        .delete(`/api/v1/admin/event-templates/${row.id}`)
        .set(admin)
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        message: 'Template berhasil dihapus',
      });
      expect(templates.rows.has(row.id)).toBe(false);
      await http()
        .delete(`/api/v1/admin/event-templates/${row.id}`)
        .set(admin)
        .expect(404);
    });
  });
});
