import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { PricingRepository } from '../src/modules/pricing/pricing.repository';
import {
  daysFromToday,
  setupEventsApp,
  type EventsTestContext,
} from './helpers/events-test-setup';
import { FakePricingRepository } from './helpers/fake-pricing.repository';
import { bodyOf } from './test-env';

interface Body<T> {
  success: boolean;
  message: string;
  data: T;
}

describe('Event prices API (e2e)', () => {
  let t: EventsTestContext;
  let pricing: FakePricingRepository;
  let eventId: string;

  const http = (): ReturnType<typeof request> =>
    request(t.ctx.app.getHttpServer());
  const base = (): string => `/api/v1/admin/events/${eventId}`;

  beforeAll(async () => {
    pricing = new FakePricingRepository();
    t = await setupEventsApp((builder) =>
      builder.overrideProvider(PricingRepository).useValue(pricing),
    );
  });

  afterAll(async () => {
    await t.ctx.app.close();
  });

  beforeEach(() => {
    t.events.events.clear();
    pricing.prices.clear();
    pricing.rules.clear();
    eventId = t.events.seed({ instructorId: t.activeInstructor }).id;
  });

  describe('access control', () => {
    it.each([
      ['get', 'pricing'],
      ['post', 'prices'],
      ['put', `prices/${randomUUID()}`],
      ['delete', `prices/${randomUUID()}`],
    ] as const)(
      '%s /admin/events/:id/%s requires an admin',
      async (method, path) => {
        const url = `/api/v1/admin/events/${randomUUID()}/${path}`;

        await http()[method](url).expect(401);
        await http()[method](url).set(t.ctx.asParticipant()).expect(403);
      },
    );
  });

  describe('GET /admin/events/:id/pricing', () => {
    it('returns prices (normal first) and bundle rules with dates as YYYY-MM-DD', async () => {
      pricing.seedPrice(eventId, {
        priceType: 'early_bird',
        price: 120000,
        startDate: new Date('2099-01-01T00:00:00Z'),
        endDate: new Date('2099-01-10T00:00:00Z'),
      });
      const normal = pricing.seedPrice(eventId, { price: 150000 });
      pricing.seedRule(eventId, { minimumQuantity: 3, discountValue: 15 });
      pricing.seedRule(eventId, { minimumQuantity: 2, discountValue: 10 });
      pricing.seedPrice(randomUUID(), { price: 1 }); // milik event lain

      const res = await http()
        .get(`${base()}/pricing`)
        .set(t.admin)
        .expect(200);
      const data = (
        res.body as Body<{
          prices: Record<string, unknown>[];
          pricing_rules: Record<string, unknown>[];
        }>
      ).data;

      expect(data.prices).toHaveLength(2);
      expect(data.prices[0]).toEqual({
        id: normal.id,
        price_type: 'normal',
        price: 150000,
        start_date: null,
        end_date: null,
        status: 'active',
      });
      expect(data.prices[1]).toMatchObject({
        price_type: 'early_bird',
        start_date: '2099-01-01',
        end_date: '2099-01-10',
      });
      expect(data.pricing_rules.map((r) => r.minimum_quantity)).toEqual([2, 3]);
      expect(data.pricing_rules[0]).toMatchObject({
        rule_type: 'bundle',
        discount_type: 'percentage',
        discount_value: 10,
        status: 'active',
      });
    });

    it('returns 404 EVENT_NOT_FOUND for an unknown event and 404 for a malformed id', async () => {
      const res = await http()
        .get(`/api/v1/admin/events/${randomUUID()}/pricing`)
        .set(t.admin)
        .expect(404);
      expect(bodyOf(res).error_code).toBe('EVENT_NOT_FOUND');
      await http()
        .get('/api/v1/admin/events/abc/pricing')
        .set(t.admin)
        .expect(404);
    });
  });

  describe('POST /admin/events/:id/prices', () => {
    it('creates a normal price without dates (201, active by default)', async () => {
      const res = await http()
        .post(`${base()}/prices`)
        .set(t.admin)
        .send({ price_type: 'normal', price: 200000 })
        .expect(201);
      const body = res.body as Body<Record<string, unknown>>;

      expect(body.message).toBe('Harga berhasil ditambahkan');
      expect(body.data).toMatchObject({
        price_type: 'normal',
        price: 200000,
        start_date: null,
        end_date: null,
        status: 'active',
      });
      expect(pricing.prices.size).toBe(1);
    });

    it('accepts a free event (price 0)', async () => {
      await http()
        .post(`${base()}/prices`)
        .set(t.admin)
        .send({ price_type: 'normal', price: 0 })
        .expect(201);
    });

    it('creates an early bird price with its period', async () => {
      const res = await http()
        .post(`${base()}/prices`)
        .set(t.admin)
        .send({
          price_type: 'early_bird',
          price: 150000,
          start_date: daysFromToday(1),
          end_date: daysFromToday(10),
        })
        .expect(201);

      expect((res.body as Body<unknown>).data).toMatchObject({
        price_type: 'early_bird',
        start_date: daysFromToday(1),
        end_date: daysFromToday(10),
      });
    });

    it('requires both dates for early bird and forbids them for normal', async () => {
      const missing = await http()
        .post(`${base()}/prices`)
        .set(t.admin)
        .send({ price_type: 'early_bird', price: 1000 })
        .expect(422);
      expect(bodyOf(missing).errors?.start_date).toBeDefined();
      expect(bodyOf(missing).errors?.end_date).toBeDefined();

      const onlyStart = await http()
        .post(`${base()}/prices`)
        .set(t.admin)
        .send({
          price_type: 'early_bird',
          price: 1000,
          start_date: daysFromToday(1),
        })
        .expect(422);
      expect(bodyOf(onlyStart).errors?.end_date).toBeDefined();

      const normalWithDates = await http()
        .post(`${base()}/prices`)
        .set(t.admin)
        .send({
          price_type: 'normal',
          price: 1000,
          start_date: daysFromToday(1),
          end_date: daysFromToday(2),
        })
        .expect(422);
      expect(bodyOf(normalWithDates).errors?.start_date).toContain(
        'Harga normal tidak memakai rentang tanggal',
      );
    });

    it('rejects an early bird period that ends before it starts, but accepts a one-day period', async () => {
      const res = await http()
        .post(`${base()}/prices`)
        .set(t.admin)
        .send({
          price_type: 'early_bird',
          price: 1000,
          start_date: daysFromToday(5),
          end_date: daysFromToday(4),
        })
        .expect(422);
      expect(bodyOf(res).errors?.end_date).toContain(
        'end_date tidak boleh sebelum start_date',
      );

      await http()
        .post(`${base()}/prices`)
        .set(t.admin)
        .send({
          price_type: 'early_bird',
          price: 1000,
          start_date: daysFromToday(5),
          end_date: daysFromToday(5),
        })
        .expect(201);
    });

    it('allows only one ACTIVE normal price per event, but any number of inactive ones', async () => {
      pricing.seedPrice(eventId, { priceType: 'normal' });

      const res = await http()
        .post(`${base()}/prices`)
        .set(t.admin)
        .send({ price_type: 'normal', price: 1 })
        .expect(422);
      expect(bodyOf(res).errors?.price_type).toContain(
        'Event sudah memiliki harga normal aktif',
      );

      await http()
        .post(`${base()}/prices`)
        .set(t.admin)
        .send({ price_type: 'normal', price: 1, status: 'inactive' })
        .expect(201);
    });

    it('rejects overlapping active early bird periods but allows adjacent, inactive, or other-event periods', async () => {
      pricing.seedPrice(eventId, {
        priceType: 'early_bird',
        startDate: new Date(`${daysFromToday(10)}T00:00:00Z`),
        endDate: new Date(`${daysFromToday(20)}T00:00:00Z`),
      });
      pricing.seedPrice(randomUUID(), {
        priceType: 'early_bird',
        startDate: new Date(`${daysFromToday(10)}T00:00:00Z`),
        endDate: new Date(`${daysFromToday(20)}T00:00:00Z`),
      });
      const post = (
        start: number,
        end: number,
        extra: Record<string, unknown> = {},
      ): request.Test =>
        http()
          .post(`${base()}/prices`)
          .set(t.admin)
          .send({
            price_type: 'early_bird',
            price: 1,
            start_date: daysFromToday(start),
            end_date: daysFromToday(end),
            ...extra,
          });

      for (const [start, end] of [
        [15, 25],
        [5, 10],
        [20, 30],
        [12, 14],
        [1, 40],
      ] as const) {
        const res = await post(start, end).expect(422);
        expect(bodyOf(res).errors?.start_date).toContain(
          'Periode bertabrakan dengan harga early bird aktif lain',
        );
      }
      await post(21, 30).expect(201); // berdampingan, tidak bertabrakan
      await post(1, 9).expect(201);
      await post(12, 14, { status: 'inactive' }).expect(201); // nonaktif tidak dihitung
    });

    it.each([
      ['unknown price_type', { price_type: 'vip', price: 1 }, 'price_type'],
      ['missing price_type', { price: 1 }, 'price_type'],
      ['missing price', { price_type: 'normal' }, 'price'],
      ['negative price', { price_type: 'normal', price: -1 }, 'price'],
      ['fractional price', { price_type: 'normal', price: 10.5 }, 'price'],
      ['string price', { price_type: 'normal', price: '1000' }, 'price'],
      [
        'price beyond INTEGER',
        { price_type: 'normal', price: 2147483648 },
        'price',
      ],
      [
        'malformed date',
        {
          price_type: 'early_bird',
          price: 1,
          start_date: '01-01-2099',
          end_date: '2099-01-02',
        },
        'start_date',
      ],
      [
        'impossible date',
        {
          price_type: 'early_bird',
          price: 1,
          start_date: '2099-02-30',
          end_date: '2099-03-01',
        },
        'start_date',
      ],
      [
        'invalid status',
        { price_type: 'normal', price: 1, status: 'banned' },
        'status',
      ],
    ])('rejects %s with 422', async (_label, body, field) => {
      const res = await http()
        .post(`${base()}/prices`)
        .set(t.admin)
        .send(body)
        .expect(422);

      expect(bodyOf(res).errors?.[field]).toBeDefined();
      expect(pricing.prices.size).toBe(0);
    });

    it('rejects unknown fields such as event_id', async () => {
      await http()
        .post(`${base()}/prices`)
        .set(t.admin)
        .send({ price_type: 'normal', price: 1, event_id: randomUUID() })
        .expect(422);
    });

    it('returns 403 EVENT_COMPLETED for a completed event and 404 for an unknown or deleted one', async () => {
      const done = t.events.seed({
        instructorId: t.activeInstructor,
        status: 'completed',
      });
      const deleted = t.events.seed({
        instructorId: t.activeInstructor,
        deletedAt: new Date(),
      });
      const body = { price_type: 'normal', price: 1 };

      const completed = await http()
        .post(`/api/v1/admin/events/${done.id}/prices`)
        .set(t.admin)
        .send(body)
        .expect(403);
      expect(bodyOf(completed).error_code).toBe('EVENT_COMPLETED');
      for (const id of [randomUUID(), deleted.id]) {
        const res = await http()
          .post(`/api/v1/admin/events/${id}/prices`)
          .set(t.admin)
          .send(body)
          .expect(404);
        expect(bodyOf(res).error_code).toBe('EVENT_NOT_FOUND');
      }
    });
  });

  describe('PUT /admin/events/:id/prices/:priceId', () => {
    it('replaces the price and keeps the status when it is omitted', async () => {
      const price = pricing.seedPrice(eventId, {
        priceType: 'normal',
        price: 100000,
        status: 'inactive',
      });

      const res = await http()
        .put(`${base()}/prices/${price.id}`)
        .set(t.admin)
        .send({ price_type: 'normal', price: 175000 })
        .expect(200);
      const body = res.body as Body<Record<string, unknown>>;

      expect(body.message).toBe('Harga berhasil diperbarui');
      expect(body.data).toMatchObject({
        id: price.id,
        price: 175000,
        status: 'inactive',
      });
    });

    it('does not count the price itself when checking for a second active normal price', async () => {
      const price = pricing.seedPrice(eventId, { priceType: 'normal' });

      await http()
        .put(`${base()}/prices/${price.id}`)
        .set(t.admin)
        .send({ price_type: 'normal', price: 1, status: 'active' })
        .expect(200);
    });

    it('rejects turning a price into a second active normal, and validates the changed type', async () => {
      pricing.seedPrice(eventId, { priceType: 'normal' });
      const early = pricing.seedPrice(eventId, {
        priceType: 'early_bird',
        startDate: new Date(`${daysFromToday(1)}T00:00:00Z`),
        endDate: new Date(`${daysFromToday(2)}T00:00:00Z`),
      });

      const second = await http()
        .put(`${base()}/prices/${early.id}`)
        .set(t.admin)
        .send({ price_type: 'normal', price: 1 })
        .expect(422);
      expect(bodyOf(second).errors?.price_type).toBeDefined();

      const noDates = await http()
        .put(`${base()}/prices/${early.id}`)
        .set(t.admin)
        .send({ price_type: 'early_bird', price: 1 })
        .expect(422);
      expect(bodyOf(noDates).errors?.start_date).toBeDefined();
    });

    it('does not let a published event lose its last active normal price (400 MISSING_PRICE)', async () => {
      t.events.events.set(eventId, {
        ...(t.events.events.get(eventId) as NonNullable<
          ReturnType<typeof t.events.events.get>
        >),
        status: 'published',
      });
      const price = pricing.seedPrice(eventId, { priceType: 'normal' });

      for (const body of [
        { price_type: 'normal', price: 1, status: 'inactive' },
        {
          price_type: 'early_bird',
          price: 1,
          start_date: daysFromToday(1),
          end_date: daysFromToday(2),
        },
      ]) {
        const res = await http()
          .put(`${base()}/prices/${price.id}`)
          .set(t.admin)
          .send(body)
          .expect(400);
        expect(bodyOf(res).error_code).toBe('MISSING_PRICE');
      }
      expect(pricing.prices.get(price.id)?.status).toBe('active');
      await http()
        .put(`${base()}/prices/${price.id}`)
        .set(t.admin)
        .send({ price_type: 'normal', price: 999 })
        .expect(200);
    });

    it('allows the same changes on a draft event', async () => {
      const price = pricing.seedPrice(eventId, { priceType: 'normal' });

      await http()
        .put(`${base()}/prices/${price.id}`)
        .set(t.admin)
        .send({ price_type: 'normal', price: 1, status: 'inactive' })
        .expect(200);
    });

    it('returns 404 for a price that belongs to another event or does not exist', async () => {
      const other = pricing.seedPrice(randomUUID());
      const body = { price_type: 'normal', price: 1 };

      const res = await http()
        .put(`${base()}/prices/${other.id}`)
        .set(t.admin)
        .send(body)
        .expect(404);
      expect(bodyOf(res).error_code).toBe('NOT_FOUND');
      await http()
        .put(`${base()}/prices/${randomUUID()}`)
        .set(t.admin)
        .send(body)
        .expect(404);
    });

    it('returns 403 EVENT_COMPLETED for a completed event', async () => {
      const done = t.events.seed({
        instructorId: t.activeInstructor,
        status: 'completed',
      });
      const price = pricing.seedPrice(done.id);

      const res = await http()
        .put(`/api/v1/admin/events/${done.id}/prices/${price.id}`)
        .set(t.admin)
        .send({ price_type: 'normal', price: 1 })
        .expect(403);

      expect(bodyOf(res).error_code).toBe('EVENT_COMPLETED');
    });
  });

  describe('DELETE /admin/events/:id/prices/:priceId', () => {
    it('deletes a price', async () => {
      const price = pricing.seedPrice(eventId, { priceType: 'normal' });

      const res = await http()
        .delete(`${base()}/prices/${price.id}`)
        .set(t.admin)
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        message: 'Harga berhasil dihapus',
      });
      expect(pricing.prices.has(price.id)).toBe(false);
    });

    it('does not let a published event lose its last active normal price, but allows deleting other prices', async () => {
      t.events.events.set(eventId, {
        ...(t.events.events.get(eventId) as NonNullable<
          ReturnType<typeof t.events.events.get>
        >),
        status: 'published',
      });
      const normal = pricing.seedPrice(eventId, { priceType: 'normal' });
      const early = pricing.seedPrice(eventId, {
        priceType: 'early_bird',
        startDate: new Date(`${daysFromToday(1)}T00:00:00Z`),
        endDate: new Date(`${daysFromToday(2)}T00:00:00Z`),
      });
      const inactiveNormal = pricing.seedPrice(eventId, {
        priceType: 'normal',
        status: 'inactive',
      });

      const blocked = await http()
        .delete(`${base()}/prices/${normal.id}`)
        .set(t.admin)
        .expect(400);
      expect(bodyOf(blocked).error_code).toBe('MISSING_PRICE');
      await http()
        .delete(`${base()}/prices/${early.id}`)
        .set(t.admin)
        .expect(200);
      await http()
        .delete(`${base()}/prices/${inactiveNormal.id}`)
        .set(t.admin)
        .expect(200);
      expect(pricing.prices.has(normal.id)).toBe(true);
    });

    it('returns 404 for unknown prices and 403 for a completed event', async () => {
      await http()
        .delete(`${base()}/prices/${randomUUID()}`)
        .set(t.admin)
        .expect(404);

      const done = t.events.seed({
        instructorId: t.activeInstructor,
        status: 'completed',
      });
      const price = pricing.seedPrice(done.id);
      await http()
        .delete(`/api/v1/admin/events/${done.id}/prices/${price.id}`)
        .set(t.admin)
        .expect(403);
    });
  });
});
