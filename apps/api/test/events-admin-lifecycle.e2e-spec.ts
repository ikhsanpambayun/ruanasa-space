import { randomUUID } from 'node:crypto';

import request from 'supertest';

import {
  setupEventsApp,
  type EventsTestContext,
} from './helpers/events-test-setup';
import { bodyOf } from './test-env';

interface Body<T> {
  success: boolean;
  message: string;
  data: T;
}

/** Menunggu microtask/promise yang dilepas (fire-and-forget) selesai. */
const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

describe('Admin events: publish, complete, duplicate, post-event (e2e)', () => {
  let t: EventsTestContext;

  const http = (): ReturnType<typeof request> =>
    request(t.ctx.app.getHttpServer());

  const seed = (
    overrides: Record<string, unknown> = {},
  ): ReturnType<typeof t.events.seed> =>
    t.events.seed({ instructorId: t.activeInstructor, ...overrides });

  beforeAll(async () => {
    t = await setupEventsApp();
  });

  afterAll(async () => {
    await t.ctx.app.close();
  });

  beforeEach(() => {
    t.events.events.clear();
    t.events.relations.clear();
    t.events.onBeforeTransition = null;
    t.notifier.calls.length = 0;
    t.notifier.failNext = false;
  });

  describe('POST /admin/events/:id/publish', () => {
    it('publishes a complete draft with a normal price and returns the share info', async () => {
      const event = seed();
      t.events.addNormalPrice(event.id);

      const res = await http()
        .post(`/api/v1/admin/events/${event.id}/publish`)
        .set(t.admin)
        .expect(200);
      const body = res.body as Body<{
        public_url: string;
        qr_code_url: string;
      }>;

      expect(body.message).toBe('Event berhasil dipublikasikan');
      expect(body.data.public_url).toBe(
        `http://localhost:3000/events/${event.id}`,
      );
      expect(body.data.qr_code_url.startsWith('data:image/png;base64,')).toBe(
        true,
      );
      expect(t.events.events.get(event.id)?.status).toBe('published');
    });

    it('requires at least one ACTIVE NORMAL price (400 MISSING_PRICE)', async () => {
      const event = seed();

      const none = await http()
        .post(`/api/v1/admin/events/${event.id}/publish`)
        .set(t.admin)
        .expect(400);
      expect(bodyOf(none)).toEqual({
        success: false,
        message: 'Event harus memiliki minimal satu harga normal',
        error_code: 'MISSING_PRICE',
      });

      // Early bird saja, atau harga normal yang nonaktif, tidak cukup.
      const relations = t.events.relations.get(event.id);
      relations?.prices.push({
        id: randomUUID(),
        eventId: event.id,
        priceType: 'early_bird',
        price: 1000,
        startDate: new Date(),
        endDate: new Date(),
        status: 'active',
        createdAt: new Date(),
      });
      relations?.prices.push({
        id: randomUUID(),
        eventId: event.id,
        priceType: 'normal',
        price: 1000,
        startDate: null,
        endDate: null,
        status: 'inactive',
        createdAt: new Date(),
      });
      await http()
        .post(`/api/v1/admin/events/${event.id}/publish`)
        .set(t.admin)
        .expect(400);
      expect(t.events.events.get(event.id)?.status).toBe('draft');
    });

    it.each([
      ['date', { date: null }],
      ['start_time', { startTime: null }],
      ['end_time', { endTime: null }],
    ])(
      'refuses to publish without %s (400 VALIDATION_ERROR)',
      async (_label, missing) => {
        const event = seed(missing);
        t.events.addNormalPrice(event.id);

        const res = await http()
          .post(`/api/v1/admin/events/${event.id}/publish`)
          .set(t.admin)
          .expect(400);

        expect(bodyOf(res)).toEqual({
          success: false,
          message: 'Tanggal dan waktu event wajib diisi sebelum dipublikasikan',
          error_code: 'VALIDATION_ERROR',
        });
        expect(t.events.events.get(event.id)?.status).toBe('draft');
      },
    );

    it.each(['published', 'completed'] as const)(
      'refuses a %s event with 403 INVALID_STATUS_TRANSITION',
      async (status) => {
        const event = seed({ status });
        t.events.addNormalPrice(event.id);

        const res = await http()
          .post(`/api/v1/admin/events/${event.id}/publish`)
          .set(t.admin)
          .expect(403);

        expect(bodyOf(res)).toEqual({
          success: false,
          message: 'Hanya event draft yang bisa dipublikasikan',
          error_code: 'INVALID_STATUS_TRANSITION',
        });
      },
    );

    it('does not publish twice when two admins click at the same time (conditional transition)', async () => {
      const event = seed();
      t.events.addNormalPrice(event.id);
      // Admin lain mempublikasikan event tepat sebelum update bersyarat milik request ini dijalankan.
      t.events.onBeforeTransition = (id): void => {
        t.events.events.set(id, {
          ...(t.events.events.get(id) as NonNullable<
            ReturnType<typeof t.events.events.get>
          >),
          status: 'published',
        });
      };

      const res = await http()
        .post(`/api/v1/admin/events/${event.id}/publish`)
        .set(t.admin)
        .expect(403);

      expect(bodyOf(res).error_code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('returns 404 EVENT_NOT_FOUND for an unknown event', async () => {
      const res = await http()
        .post(`/api/v1/admin/events/${randomUUID()}/publish`)
        .set(t.admin)
        .expect(404);

      expect(bodyOf(res).error_code).toBe('EVENT_NOT_FOUND');
    });
  });

  describe('POST /admin/events/:id/complete', () => {
    it('completes a published event, stamps completed_at, and triggers the post-event notification', async () => {
      const event = seed({ status: 'published' });

      const res = await http()
        .post(`/api/v1/admin/events/${event.id}/complete`)
        .set(t.admin)
        .expect(200);
      await flush();

      expect(res.body).toMatchObject({
        success: true,
        message: 'Event ditandai selesai',
      });
      const stored = t.events.events.get(event.id);
      expect(stored?.status).toBe('completed');
      expect(stored?.completedAt).toBeInstanceOf(Date);
      expect(t.notifier.calls).toEqual([event.id]);
    });

    it('still completes the event when the notification provider fails (best effort, asynchronous)', async () => {
      const event = seed({ status: 'published' });
      t.notifier.failNext = true;

      await http()
        .post(`/api/v1/admin/events/${event.id}/complete`)
        .set(t.admin)
        .expect(200);
      await flush();

      expect(t.events.events.get(event.id)?.status).toBe('completed');
      expect(t.notifier.calls).toEqual([event.id]);
    });

    it.each(['draft', 'completed'] as const)(
      'refuses a %s event with 403 INVALID_STATUS_TRANSITION and sends nothing',
      async (status) => {
        const event = seed({ status });

        const res = await http()
          .post(`/api/v1/admin/events/${event.id}/complete`)
          .set(t.admin)
          .expect(403);
        await flush();

        expect(bodyOf(res)).toEqual({
          success: false,
          message: 'Hanya event published yang bisa ditandai selesai',
          error_code: 'INVALID_STATUS_TRANSITION',
        });
        expect(t.notifier.calls).toEqual([]);
      },
    );

    it('triggers the notification only once when completed twice in a row', async () => {
      const event = seed({ status: 'published' });

      await http()
        .post(`/api/v1/admin/events/${event.id}/complete`)
        .set(t.admin)
        .expect(200);
      await http()
        .post(`/api/v1/admin/events/${event.id}/complete`)
        .set(t.admin)
        .expect(403);
      await flush();

      expect(t.notifier.calls).toHaveLength(1);
    });
  });

  describe('POST /admin/events/:id/duplicate', () => {
    it('creates a draft copy without date and times, keeping pricing, bundle rules, and add-ons', async () => {
      const source = seed({
        status: 'completed',
        eventName: 'Asli',
        capacity: 25,
        templateId: null,
      });
      t.events.addNormalPrice(source.id, 175000);
      const relations = t.events.relations.get(source.id);
      relations?.pricingRules.push({
        id: randomUUID(),
        eventId: source.id,
        ruleType: 'bundle',
        minimumQuantity: 2,
        discountType: 'percentage',
        discountValue: 10,
        status: 'active',
        createdAt: new Date(),
      });
      relations?.addons.push({
        id: randomUUID(),
        eventId: source.id,
        name: 'Sewa Mat',
        description: null,
        price: 25000,
        availableQuantity: 20,
        maxPurchaseQuantity: 2,
        status: 'active',
        createdAt: new Date(),
      });

      const res = await http()
        .post(`/api/v1/admin/events/${source.id}/duplicate`)
        .set(t.admin)
        .expect(201);
      const body = res.body as Body<Record<string, unknown>>;

      expect(body.message).toBe('Event berhasil diduplikasi');
      expect(body.data).toMatchObject({
        event_name: 'Asli',
        capacity: 25,
        instructor_id: t.activeInstructor,
        status: 'draft',
        date: null,
        start_time: null,
        end_time: null,
        completed_at: null,
        post_event_sent: false,
        registered_count: 0,
      });
      expect(body.data.id).not.toBe(source.id);

      const copyRelations = t.events.relations.get(body.data.id as string);
      expect(copyRelations?.prices).toHaveLength(1);
      expect(copyRelations?.prices[0]).toMatchObject({
        price: 175000,
        priceType: 'normal',
      });
      expect(copyRelations?.pricingRules).toHaveLength(1);
      expect(copyRelations?.addons[0]).toMatchObject({
        name: 'Sewa Mat',
        price: 25000,
      });
      // Salinan tidak berbagi baris dengan sumber.
      expect(copyRelations?.prices[0]?.id).not.toBe(relations?.prices[0]?.id);
      expect(t.events.events.get(source.id)?.status).toBe('completed');
    });

    it('requires the copy to be completed (date, times) before it can be published', async () => {
      const source = seed({ status: 'published' });
      t.events.addNormalPrice(source.id);
      const copy = await http()
        .post(`/api/v1/admin/events/${source.id}/duplicate`)
        .set(t.admin)
        .expect(201);
      const copyId = (copy.body as Body<{ id: string }>).data.id;

      const res = await http()
        .post(`/api/v1/admin/events/${copyId}/publish`)
        .set(t.admin)
        .expect(400);

      expect(bodyOf(res).error_code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for an unknown or soft-deleted event', async () => {
      const deleted = seed({ deletedAt: new Date() });

      await http()
        .post(`/api/v1/admin/events/${randomUUID()}/duplicate`)
        .set(t.admin)
        .expect(404);
      await http()
        .post(`/api/v1/admin/events/${deleted.id}/duplicate`)
        .set(t.admin)
        .expect(404);
    });
  });

  describe('POST /admin/events/:id/send-post-event', () => {
    it('re-triggers the notification for a completed event', async () => {
      const event = seed({ status: 'completed' });

      const res = await http()
        .post(`/api/v1/admin/events/${event.id}/send-post-event`)
        .set(t.admin)
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        message: 'Post-event notification dikirim',
      });
      expect(t.notifier.calls).toEqual([event.id]);
    });

    it.each(['draft', 'published'] as const)(
      'refuses a %s event with 403 INVALID_STATUS_TRANSITION',
      async (status) => {
        const event = seed({ status });

        const res = await http()
          .post(`/api/v1/admin/events/${event.id}/send-post-event`)
          .set(t.admin)
          .expect(403);

        expect(bodyOf(res)).toEqual({
          success: false,
          message: 'Event belum completed',
          error_code: 'INVALID_STATUS_TRANSITION',
        });
        expect(t.notifier.calls).toEqual([]);
      },
    );

    it('reports a failure instead of claiming success when the notification itself fails', async () => {
      const event = seed({ status: 'completed' });
      t.notifier.failNext = true;

      const res = await http()
        .post(`/api/v1/admin/events/${event.id}/send-post-event`)
        .set(t.admin)
        .expect(500);

      expect(bodyOf(res).error_code).toBe('INTERNAL_ERROR');
    });

    it('returns 404 for an unknown event', async () => {
      await http()
        .post(`/api/v1/admin/events/${randomUUID()}/send-post-event`)
        .set(t.admin)
        .expect(404);
    });
  });
});
