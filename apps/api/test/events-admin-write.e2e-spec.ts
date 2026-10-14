import { randomUUID } from 'node:crypto';

import request from 'supertest';

import {
  daysFromToday,
  setupEventsApp,
  type EventsTestContext,
} from './helpers/events-test-setup';
import { bodyOf } from './test-env';

interface Body<T> {
  success: boolean;
  message: string;
  data: T;
}

describe('Admin events: create, update, delete (e2e)', () => {
  let t: EventsTestContext;

  const http = (): ReturnType<typeof request> =>
    request(t.ctx.app.getHttpServer());

  const valid = (
    override: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    event_name: 'Vinyasa Flow Pagi',
    activity_type: 'yoga',
    description: 'Kelas vinyasa dinamis untuk semua level.',
    poster_url: 'https://cdn.example.com/poster.jpg',
    date: daysFromToday(14),
    start_time: '08:00',
    end_time: '09:30',
    location: 'Ruanasa Studio, Jakarta Selatan',
    instructor_id: t.activeInstructor,
    capacity: 20,
    ...override,
  });

  beforeAll(async () => {
    t = await setupEventsApp();
  });

  afterAll(async () => {
    await t.ctx.app.close();
  });

  beforeEach(() => {
    t.events.events.clear();
    t.events.relations.clear();
    t.events.registered.clear();
    t.events.templates.clear();
  });

  describe('POST /admin/events', () => {
    it('creates a draft event (201) with the documented fields', async () => {
      const res = await http()
        .post('/api/v1/admin/events')
        .set(t.admin)
        .send(valid())
        .expect(201);
      const body = res.body as Body<Record<string, unknown>>;

      expect(body.message).toBe('Event berhasil dibuat');
      expect(body.data).toMatchObject({
        event_name: 'Vinyasa Flow Pagi',
        activity_type: 'yoga',
        date: daysFromToday(14),
        start_time: '08:00',
        end_time: '09:30',
        capacity: 20,
        registered_count: 0,
        available_slots: 20,
        status: 'draft',
        completed_at: null,
        post_event_sent: false,
        instructor_id: t.activeInstructor,
        template_id: null,
      });
      expect(t.events.events.size).toBe(1);
    });

    it('trims text, and accepts a draft without date and times (they are required only at publish)', async () => {
      const res = await http()
        .post('/api/v1/admin/events')
        .set(t.admin)
        .send(
          valid({
            event_name: '  Yin Yoga  ',
            date: null,
            start_time: null,
            end_time: null,
          }),
        )
        .expect(201);

      expect((res.body as Body<unknown>).data).toMatchObject({
        event_name: 'Yin Yoga',
        date: null,
        start_time: null,
        end_time: null,
      });

      const omitted = valid();
      delete omitted.date;
      delete omitted.start_time;
      delete omitted.end_time;
      await http()
        .post('/api/v1/admin/events')
        .set(t.admin)
        .send(omitted)
        .expect(201);
    });

    it('accepts today but rejects a past date', async () => {
      await http()
        .post('/api/v1/admin/events')
        .set(t.admin)
        .send(valid({ date: daysFromToday(0) }))
        .expect(201);

      const res = await http()
        .post('/api/v1/admin/events')
        .set(t.admin)
        .send(valid({ date: daysFromToday(-1) }))
        .expect(422);
      expect(bodyOf(res).errors?.date).toContain(
        'Tanggal tidak boleh di masa lalu',
      );
    });

    it('requires end_time to be after start_time', async () => {
      for (const [start, end] of [
        ['10:00', '10:00'],
        ['10:00', '09:59'],
      ] as const) {
        const res = await http()
          .post('/api/v1/admin/events')
          .set(t.admin)
          .send(valid({ start_time: start, end_time: end }))
          .expect(422);
        expect(bodyOf(res).errors?.end_time).toContain(
          'End time harus setelah start time',
        );
      }
    });

    it('accepts the template and rejects a template that does not exist', async () => {
      const templateId = randomUUID();
      t.events.templates.add(templateId);
      const ok = await http()
        .post('/api/v1/admin/events')
        .set(t.admin)
        .send(valid({ template_id: templateId }))
        .expect(201);
      expect((ok.body as Body<{ template_id: string }>).data.template_id).toBe(
        templateId,
      );

      const res = await http()
        .post('/api/v1/admin/events')
        .set(t.admin)
        .send(valid({ template_id: randomUUID() }))
        .expect(422);
      expect(bodyOf(res).errors?.template_id).toContain(
        'Template tidak ditemukan',
      );
    });

    it('rejects an unknown or inactive instructor with the specified message', async () => {
      for (const instructorId of [randomUUID(), t.inactiveInstructor]) {
        const res = await http()
          .post('/api/v1/admin/events')
          .set(t.admin)
          .send(valid({ instructor_id: instructorId }))
          .expect(422);
        expect(bodyOf(res).errors?.instructor_id).toContain(
          'Instructor tidak ditemukan atau tidak aktif',
        );
      }
    });

    it('reports every problem at once instead of one at a time', async () => {
      const res = await http()
        .post('/api/v1/admin/events')
        .set(t.admin)
        .send(
          valid({
            date: daysFromToday(-3),
            start_time: '10:00',
            end_time: '09:00',
            instructor_id: randomUUID(),
          }),
        )
        .expect(422);

      expect(Object.keys(bodyOf(res).errors ?? {}).sort()).toEqual([
        'date',
        'end_time',
        'instructor_id',
      ]);
    });

    it.each([
      ['missing event_name', { event_name: undefined }, 'event_name'],
      ['blank event_name', { event_name: '   ' }, 'event_name'],
      ['event_name over 150', { event_name: 'x'.repeat(151) }, 'event_name'],
      [
        'activity_type over 50',
        { activity_type: 'x'.repeat(51) },
        'activity_type',
      ],
      ['missing description', { description: undefined }, 'description'],
      [
        'description over 5000',
        { description: 'x'.repeat(5001) },
        'description',
      ],
      ['poster_url not a URL', { poster_url: 'poster.jpg' }, 'poster_url'],
      [
        'poster_url with javascript: scheme',
        { poster_url: 'javascript:alert(1)' },
        'poster_url',
      ],
      ['missing location', { location: undefined }, 'location'],
      ['location over 500', { location: 'x'.repeat(501) }, 'location'],
      ['missing instructor_id', { instructor_id: undefined }, 'instructor_id'],
      ['instructor_id not a uuid', { instructor_id: '123' }, 'instructor_id'],
      ['zero capacity', { capacity: 0 }, 'capacity'],
      ['negative capacity', { capacity: -5 }, 'capacity'],
      ['fractional capacity', { capacity: 1.5 }, 'capacity'],
      ['string capacity', { capacity: '10' }, 'capacity'],
      ['capacity over the limit', { capacity: 100001 }, 'capacity'],
      ['malformed date', { date: '15-01-2099' }, 'date'],
      ['impossible date', { date: '2099-02-31' }, 'date'],
      ['start_time without leading zero', { start_time: '8:00' }, 'start_time'],
      ['start_time out of range', { start_time: '25:00' }, 'start_time'],
      ['end_time with seconds', { end_time: '09:30:00' }, 'end_time'],
      ['template_id not a uuid', { template_id: 'abc' }, 'template_id'],
    ])('rejects %s with 422', async (_label, override, field) => {
      const res = await http()
        .post('/api/v1/admin/events')
        .set(t.admin)
        .send(valid(override))
        .expect(422);

      expect(bodyOf(res).errors?.[field]).toBeDefined();
      expect(t.events.events.size).toBe(0);
    });

    it('rejects fields that cannot be set at creation (status, id, registered_count)', async () => {
      for (const extra of [
        { status: 'published' },
        { id: randomUUID() },
        { registered_count: 5 },
        { deleted_at: null },
      ]) {
        await http()
          .post('/api/v1/admin/events')
          .set(t.admin)
          .send(valid(extra))
          .expect(422);
      }
      expect(t.events.events.size).toBe(0);
    });
  });

  describe('PUT /admin/events/:id', () => {
    const seed = (
      overrides: Record<string, unknown> = {},
    ): ReturnType<typeof t.events.seed> =>
      t.events.seed({ instructorId: t.activeInstructor, ...overrides });

    it('updates only the fields that are sent', async () => {
      const event = seed();

      const res = await http()
        .put(`/api/v1/admin/events/${event.id}`)
        .set(t.admin)
        .send({ event_name: 'Nama Baru', capacity: 40 })
        .expect(200);
      const body = res.body as Body<Record<string, unknown>>;

      expect(body.message).toBe('Event berhasil diperbarui');
      expect(body.data).toMatchObject({
        event_name: 'Nama Baru',
        capacity: 40,
        location: 'Ruanasa Studio',
        start_time: '08:00',
      });
    });

    it('an empty body changes nothing', async () => {
      const event = seed();

      const res = await http()
        .put(`/api/v1/admin/events/${event.id}`)
        .set(t.admin)
        .send({})
        .expect(200);

      expect((res.body as Body<Record<string, unknown>>).data).toMatchObject({
        event_name: 'Vinyasa Flow',
        capacity: 20,
      });
    });

    it('allows a draft to change its activity type, instructor, template, and to clear the template and schedule', async () => {
      const templateId = randomUUID();
      t.events.templates.add(templateId);
      const event = seed({ templateId });

      const res = await http()
        .put(`/api/v1/admin/events/${event.id}`)
        .set(t.admin)
        .send({
          activity_type: 'meditation',
          template_id: null,
          date: null,
          start_time: null,
          end_time: null,
        })
        .expect(200);

      expect((res.body as Body<Record<string, unknown>>).data).toMatchObject({
        activity_type: 'meditation',
        template_id: null,
        date: null,
        start_time: null,
        end_time: null,
      });
    });

    it('rejects every update of a completed event with 403 EVENT_COMPLETED', async () => {
      const event = seed({ status: 'completed' });

      const res = await http()
        .put(`/api/v1/admin/events/${event.id}`)
        .set(t.admin)
        .send({ event_name: 'X' })
        .expect(403);

      expect(bodyOf(res)).toEqual({
        success: false,
        message: 'Event yang sudah selesai tidak dapat diubah',
        error_code: 'EVENT_COMPLETED',
      });
    });

    describe('published events', () => {
      it('allows changing everything except activity_type', async () => {
        const event = seed({ status: 'published' });

        await http()
          .put(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .send({
            event_name: 'Baru',
            location: 'Tempat Baru',
            description: 'Deskripsi baru',
            date: daysFromToday(30),
            start_time: '07:00',
            end_time: '08:00',
          })
          .expect(200);
      });

      it('rejects a different activity_type but tolerates re-sending the same one', async () => {
        const event = seed({ status: 'published' });

        const res = await http()
          .put(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .send({ activity_type: 'meditation' })
          .expect(422);
        expect(bodyOf(res).errors?.activity_type).toBeDefined();

        await http()
          .put(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .send({ activity_type: 'yoga', event_name: 'Sama' })
          .expect(200);
      });

      it('does not allow clearing the schedule', async () => {
        const event = seed({ status: 'published' });

        for (const field of ['date', 'start_time', 'end_time']) {
          const res = await http()
            .put(`/api/v1/admin/events/${event.id}`)
            .set(t.admin)
            .send({ [field]: null })
            .expect(422);
          expect(bodyOf(res).errors?.[field]).toBeDefined();
        }
      });

      it('does not allow shrinking capacity below the registered participants', async () => {
        const event = seed({ status: 'published', capacity: 30 });
        t.events.registered.set(event.id, 25);

        const res = await http()
          .put(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .send({ capacity: 24 })
          .expect(422);
        expect(bodyOf(res).errors?.capacity?.[0]).toContain('(25)');

        await http()
          .put(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .send({ capacity: 25 })
          .expect(200);
      });
    });

    describe('date and time checks', () => {
      it('rejects moving the date to the past but allows editing other fields of an event whose date has passed', async () => {
        const event = seed({
          status: 'published',
          date: new Date(`${daysFromToday(-2)}T00:00:00Z`),
        });

        await http()
          .put(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .send({ description: 'Koreksi typo' })
          .expect(200);
        await http()
          .put(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .send({ date: daysFromToday(-2), location: 'Sama' })
          .expect(200);

        const res = await http()
          .put(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .send({ date: daysFromToday(-1) })
          .expect(422);
        expect(bodyOf(res).errors?.date).toContain(
          'Tanggal tidak boleh di masa lalu',
        );
      });

      it('checks end_time against the stored start_time when only end_time is sent', async () => {
        const event = seed(); // 08:00 - 09:30

        const res = await http()
          .put(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .send({ end_time: '07:59' })
          .expect(422);
        expect(bodyOf(res).errors?.end_time).toContain(
          'End time harus setelah start time',
        );

        await http()
          .put(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .send({ end_time: '10:00' })
          .expect(200);
      });
    });

    describe('references', () => {
      it('rejects null for required fields', async () => {
        const event = seed();

        for (const field of [
          'event_name',
          'activity_type',
          'description',
          'poster_url',
          'location',
          'instructor_id',
          'capacity',
        ]) {
          const res = await http()
            .put(`/api/v1/admin/events/${event.id}`)
            .set(t.admin)
            .send({ [field]: null })
            .expect(422);
          expect(bodyOf(res).errors?.[field]).toBeDefined();
        }
      });

      it('validates a new instructor but accepts the current one even if it became inactive', async () => {
        const event = seed({ instructorId: t.inactiveInstructor });

        await http()
          .put(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .send({ instructor_id: t.inactiveInstructor, event_name: 'Tetap' })
          .expect(200);

        const res = await http()
          .put(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .send({ instructor_id: randomUUID() })
          .expect(422);
        expect(bodyOf(res).errors?.instructor_id).toContain(
          'Instructor tidak ditemukan atau tidak aktif',
        );
        await http()
          .put(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .send({ instructor_id: t.activeInstructor })
          .expect(200);
      });

      it('rejects an unknown template', async () => {
        const event = seed();

        const res = await http()
          .put(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .send({ template_id: randomUUID() })
          .expect(422);
        expect(bodyOf(res).errors?.template_id).toBeDefined();
      });
    });

    it('rejects fields that cannot be edited (status, deleted_at, completed_at) so state changes go through their own endpoints', async () => {
      const event = seed();

      for (const extra of [
        { status: 'published' },
        { deleted_at: null },
        { completed_at: null },
        { post_event_sent: true },
      ]) {
        await http()
          .put(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .send(extra)
          .expect(422);
      }
      expect(t.events.events.get(event.id)?.status).toBe('draft');
    });

    it('returns 404 EVENT_NOT_FOUND for unknown and soft-deleted events', async () => {
      const deleted = seed({ deletedAt: new Date() });

      for (const id of [randomUUID(), deleted.id]) {
        const res = await http()
          .put(`/api/v1/admin/events/${id}`)
          .set(t.admin)
          .send({ event_name: 'X' })
          .expect(404);
        expect(bodyOf(res).error_code).toBe('EVENT_NOT_FOUND');
      }
    });
  });

  describe('DELETE /admin/events/:id', () => {
    it('soft-deletes a draft event; it then disappears', async () => {
      const event = t.events.seed({ instructorId: t.activeInstructor });

      const res = await http()
        .delete(`/api/v1/admin/events/${event.id}`)
        .set(t.admin)
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        message: 'Event berhasil dihapus',
      });
      expect(t.events.events.get(event.id)?.deletedAt).not.toBeNull();
      await http()
        .get(`/api/v1/admin/events/${event.id}`)
        .set(t.admin)
        .expect(404);
      await http()
        .delete(`/api/v1/admin/events/${event.id}`)
        .set(t.admin)
        .expect(404);
    });

    it.each(['published', 'completed'] as const)(
      'refuses to delete a %s event with 403 EVENT_DELETE_NOT_ALLOWED',
      async (status) => {
        const event = t.events.seed({
          instructorId: t.activeInstructor,
          status,
        });

        const res = await http()
          .delete(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .expect(403);

        expect(bodyOf(res)).toEqual({
          success: false,
          message: 'Hanya event berstatus draft yang bisa dihapus',
          error_code: 'EVENT_DELETE_NOT_ALLOWED',
        });
        expect(t.events.events.get(event.id)?.deletedAt).toBeNull();
      },
    );

    it('does not delete when the event was published between the check and the delete (race)', async () => {
      const event = t.events.seed({ instructorId: t.activeInstructor });
      const original = t.events.softDeleteDraft.bind(t.events);
      t.events.softDeleteDraft = (id: string): Promise<boolean> => {
        t.events.events.set(id, {
          ...(t.events.events.get(id) as NonNullable<
            ReturnType<typeof t.events.events.get>
          >),
          status: 'published',
        });
        return original(id);
      };

      try {
        await http()
          .delete(`/api/v1/admin/events/${event.id}`)
          .set(t.admin)
          .expect(403);
        expect(t.events.events.get(event.id)?.deletedAt).toBeNull();
      } finally {
        t.events.softDeleteDraft = original;
      }
    });
  });
});
