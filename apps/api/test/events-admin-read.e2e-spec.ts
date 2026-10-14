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
  pagination?: { page: number; per_page: number; total_items: number };
}

describe('Admin events: access, list, detail, share (e2e)', () => {
  let t: EventsTestContext;

  const http = (): ReturnType<typeof request> =>
    request(t.ctx.app.getHttpServer());

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
  });

  describe('access control', () => {
    const id = '6f1c2f0e-3a53-4f7e-9f1e-0c6f5b7a1d11';
    it.each([
      ['GET', '/api/v1/admin/events'],
      ['GET', `/api/v1/admin/events/${id}`],
      ['POST', '/api/v1/admin/events'],
      ['PUT', `/api/v1/admin/events/${id}`],
      ['DELETE', `/api/v1/admin/events/${id}`],
      ['POST', `/api/v1/admin/events/${id}/publish`],
      ['POST', `/api/v1/admin/events/${id}/complete`],
      ['POST', `/api/v1/admin/events/${id}/duplicate`],
      ['GET', `/api/v1/admin/events/${id}/share`],
      ['POST', `/api/v1/admin/events/${id}/send-post-event`],
    ])('%s %s requires an admin', async (method, path) => {
      const call = (): request.Test =>
        http()[method.toLowerCase() as 'get' | 'post' | 'put' | 'delete'](path);

      await call().expect(401);
      const forbidden = await call().set(t.ctx.asParticipant()).expect(403);
      expect(bodyOf(forbidden).error_code).toBe('FORBIDDEN');
    });
  });

  describe('GET /admin/events', () => {
    it('lists events newest first with registered_count and instructor_name', async () => {
      const first = t.events.seed({
        instructorId: t.activeInstructor,
        eventName: 'Pertama',
      });
      t.events.seed({
        instructorId: t.activeInstructor,
        eventName: 'Kedua',
        status: 'published',
      });
      t.events.registered.set(first.id, 7);

      const res = await http()
        .get('/api/v1/admin/events')
        .set(t.admin)
        .expect(200);
      const body = res.body as Body<Record<string, unknown>[]>;

      expect(body.data.map((row) => row.event_name)).toEqual([
        'Kedua',
        'Pertama',
      ]);
      expect(body.data[1]).toEqual({
        id: first.id,
        event_name: 'Pertama',
        activity_type: 'yoga',
        date: '2099-01-15',
        instructor_name: 'Ayu Prameswari',
        capacity: 20,
        registered_count: 7,
        status: 'draft',
        created_at: expect.stringMatching(
          /^2026-10-01T07:00:\d{2}\+07:00$/,
        ) as string,
      });
      expect(body.pagination).toEqual({
        page: 1,
        per_page: 20,
        total_items: 2,
      });
    });

    it('filters by status and searches name, activity type, and instructor (case-insensitive)', async () => {
      t.events.seed({
        instructorId: t.activeInstructor,
        eventName: 'Yin Yoga Malam',
        status: 'published',
      });
      t.events.seed({
        instructorId: t.inactiveInstructor,
        eventName: 'Sound Healing',
        activityType: 'meditation',
      });

      const published = await http()
        .get('/api/v1/admin/events?status=published')
        .set(t.admin)
        .expect(200);
      expect(
        (published.body as Body<{ event_name: string }[]>).data.map(
          (r) => r.event_name,
        ),
      ).toEqual(['Yin Yoga Malam']);

      for (const [query, expected] of [
        ['yin', 'Yin Yoga Malam'],
        ['MEDITATION', 'Sound Healing'],
        ['bima', 'Sound Healing'],
      ] as const) {
        const res = await http()
          .get(`/api/v1/admin/events?search=${query}`)
          .set(t.admin)
          .expect(200);
        expect(
          (res.body as Body<{ event_name: string }[]>).data.map(
            (r) => r.event_name,
          ),
        ).toEqual([expected]);
      }
    });

    it('excludes soft-deleted events and paginates', async () => {
      for (let i = 1; i <= 3; i += 1) {
        t.events.seed({
          instructorId: t.activeInstructor,
          eventName: `Event ${i}`,
        });
      }
      t.events.seed({
        instructorId: t.activeInstructor,
        eventName: 'Dihapus',
        deletedAt: new Date(),
      });

      const page1 = await http()
        .get('/api/v1/admin/events?page=1&per_page=2')
        .set(t.admin)
        .expect(200);
      const page2 = await http()
        .get('/api/v1/admin/events?page=2&per_page=2')
        .set(t.admin)
        .expect(200);

      expect((page1.body as Body<unknown[]>).data).toHaveLength(2);
      expect((page2.body as Body<unknown[]>).data).toHaveLength(1);
      expect((page1.body as Body<unknown[]>).pagination).toEqual({
        page: 1,
        per_page: 2,
        total_items: 3,
      });
    });

    it.each([
      'status=archived',
      'page=0',
      'per_page=101',
      `search=${'x'.repeat(101)}`,
    ])('rejects ?%s with 422', async (query) => {
      await http()
        .get(`/api/v1/admin/events?${query}`)
        .set(t.admin)
        .expect(422);
    });
  });

  describe('GET /admin/events/:id', () => {
    it('returns the full event with instructor, template, prices, rules, add-ons, and registration summary', async () => {
      const event = t.events.seed({
        instructorId: t.activeInstructor,
        status: 'published',
        capacity: 30,
        templateId: randomUUID(),
      });
      t.events.addNormalPrice(event.id, 150000);
      t.events.registered.set(event.id, 25);
      t.events.confirmed.set(event.id, 8);
      t.events.pending.set(event.id, 2);

      const res = await http()
        .get(`/api/v1/admin/events/${event.id}`)
        .set(t.admin)
        .expect(200);
      const data = (res.body as Body<Record<string, unknown>>).data;

      expect(data).toMatchObject({
        id: event.id,
        event_name: 'Vinyasa Flow',
        date: '2099-01-15',
        start_time: '08:00',
        end_time: '09:30',
        capacity: 30,
        registered_count: 25,
        available_slots: 5,
        status: 'published',
        completed_at: null,
        post_event_sent: false,
        instructor: {
          id: t.activeInstructor,
          name: 'Ayu Prameswari',
          status: 'active',
        },
        template: { id: event.templateId, name: 'Template' },
        pricing_rules: [],
        addons: [],
        registration_summary: {
          registered_count: 25,
          available_slots: 5,
          confirmed_registrations: 8,
          pending_registrations: 2,
        },
      });
      expect((data.prices as Record<string, unknown>[])[0]).toMatchObject({
        price_type: 'normal',
        price: 150000,
        status: 'active',
      });
    });

    it('never reports negative available_slots', async () => {
      const event = t.events.seed({
        instructorId: t.activeInstructor,
        capacity: 5,
      });
      t.events.registered.set(event.id, 9);

      const res = await http()
        .get(`/api/v1/admin/events/${event.id}`)
        .set(t.admin)
        .expect(200);

      expect(
        (res.body as Body<{ available_slots: number }>).data.available_slots,
      ).toBe(0);
    });

    it('returns 404 EVENT_NOT_FOUND for unknown, soft-deleted, and malformed ids', async () => {
      const deleted = t.events.seed({
        instructorId: t.activeInstructor,
        deletedAt: new Date(),
      });

      for (const id of [randomUUID(), deleted.id]) {
        const res = await http()
          .get(`/api/v1/admin/events/${id}`)
          .set(t.admin)
          .expect(404);
        expect(bodyOf(res)).toEqual({
          success: false,
          message: 'Event tidak ditemukan',
          error_code: 'EVENT_NOT_FOUND',
        });
      }
      const malformed = await http()
        .get('/api/v1/admin/events/bukan-uuid')
        .set(t.admin)
        .expect(404);
      expect(bodyOf(malformed).error_code).toBe('NOT_FOUND');
    });
  });

  describe('GET /admin/events/:id/share', () => {
    it('returns the public URL and an inline PNG QR code', async () => {
      const event = t.events.seed({
        instructorId: t.activeInstructor,
        status: 'published',
      });

      const res = await http()
        .get(`/api/v1/admin/events/${event.id}/share`)
        .set(t.admin)
        .expect(200);
      const data = (
        res.body as Body<{ public_url: string; qr_code_url: string }>
      ).data;

      expect(data.public_url).toBe(`http://localhost:3000/events/${event.id}`);
      expect(data.qr_code_url).toMatch(
        /^data:image\/png;base64,[A-Za-z0-9+/=]{200,}$/,
      );
      const png = Buffer.from(data.qr_code_url.split(',')[1] ?? '', 'base64');
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    });

    it('returns 404 for an unknown event', async () => {
      await http()
        .get(`/api/v1/admin/events/${randomUUID()}/share`)
        .set(t.admin)
        .expect(404);
    });
  });

  it('uses relative dates safely (sanity check of the test helper)', () => {
    expect(daysFromToday(1) > daysFromToday(0)).toBe(true);
  });
});
