import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { PricingRepository } from '../src/modules/pricing/pricing.repository';
import {
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

describe('Event bundle rules API (e2e)', () => {
  let t: EventsTestContext;
  let pricing: FakePricingRepository;
  let eventId: string;

  const http = (): ReturnType<typeof request> =>
    request(t.ctx.app.getHttpServer());
  const base = (): string => `/api/v1/admin/events/${eventId}/pricing-rules`;
  const valid = (
    override: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    rule_type: 'bundle',
    minimum_quantity: 2,
    discount_type: 'percentage',
    discount_value: 10,
    ...override,
  });

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
    pricing.rules.clear();
    eventId = t.events.seed({ instructorId: t.activeInstructor }).id;
  });

  it('requires an admin for every endpoint', async () => {
    for (const [method, path] of [
      ['post', `/api/v1/admin/events/${randomUUID()}/pricing-rules`],
      [
        'put',
        `/api/v1/admin/events/${randomUUID()}/pricing-rules/${randomUUID()}`,
      ],
      [
        'delete',
        `/api/v1/admin/events/${randomUUID()}/pricing-rules/${randomUUID()}`,
      ],
    ] as const) {
      await http()[method](path).expect(401);
      await http()[method](path).set(t.ctx.asParticipant()).expect(403);
    }
  });

  describe('POST /admin/events/:id/pricing-rules', () => {
    it('creates a percentage bundle rule (201, active by default, rule_type defaults to bundle)', async () => {
      const res = await http()
        .post(base())
        .set(t.admin)
        .send(valid())
        .expect(201);
      const body = res.body as Body<Record<string, unknown>>;

      expect(body.message).toBe('Aturan bundle berhasil ditambahkan');
      expect(body.data).toMatchObject({
        rule_type: 'bundle',
        minimum_quantity: 2,
        discount_type: 'percentage',
        discount_value: 10,
        status: 'active',
      });

      const withoutType = valid({ minimum_quantity: 3 });
      delete withoutType.rule_type;
      await http().post(base()).set(t.admin).send(withoutType).expect(201);
    });

    it('limits percentage to 100 but lets fixed_amount be any positive amount', async () => {
      const over = await http()
        .post(base())
        .set(t.admin)
        .send(valid({ discount_value: 101 }))
        .expect(422);
      expect(bodyOf(over).errors?.discount_value).toContain(
        'Persentase diskon maksimal 100',
      );

      await http()
        .post(base())
        .set(t.admin)
        .send(valid({ discount_value: 100 }))
        .expect(201);
      await http()
        .post(base())
        .set(t.admin)
        .send(
          valid({
            minimum_quantity: 3,
            discount_type: 'fixed_amount',
            discount_value: 25000,
          }),
        )
        .expect(201);
    });

    it('enforces one rule per minimum quantity within an event (but not across events)', async () => {
      pricing.seedRule(eventId, { minimumQuantity: 2 });
      pricing.seedRule(randomUUID(), { minimumQuantity: 3 });

      const dup = await http()
        .post(base())
        .set(t.admin)
        .send(valid({ minimum_quantity: 2 }))
        .expect(422);
      expect(bodyOf(dup).errors?.minimum_quantity).toContain(
        'Aturan bundle untuk jumlah minimum ini sudah ada',
      );

      await http()
        .post(base())
        .set(t.admin)
        .send(valid({ minimum_quantity: 3 }))
        .expect(201);
    });

    it.each([
      ['minimum_quantity 1', { minimum_quantity: 1 }, 'minimum_quantity'],
      ['minimum_quantity 0', { minimum_quantity: 0 }, 'minimum_quantity'],
      [
        'minimum_quantity over the limit',
        { minimum_quantity: 1001 },
        'minimum_quantity',
      ],
      [
        'fractional minimum_quantity',
        { minimum_quantity: 2.5 },
        'minimum_quantity',
      ],
      [
        'string minimum_quantity',
        { minimum_quantity: '2' },
        'minimum_quantity',
      ],
      ['unknown discount_type', { discount_type: 'bogus' }, 'discount_type'],
      ['zero discount_value', { discount_value: 0 }, 'discount_value'],
      ['fractional discount_value', { discount_value: 10.5 }, 'discount_value'],
      ['unknown rule_type', { rule_type: 'tier' }, 'rule_type'],
      ['invalid status', { status: 'banned' }, 'status'],
    ])('rejects %s with 422', async (_label, override, field) => {
      const res = await http()
        .post(base())
        .set(t.admin)
        .send(valid(override))
        .expect(422);

      expect(bodyOf(res).errors?.[field]).toBeDefined();
      expect(pricing.rules.size).toBe(0);
    });

    it('returns 403 for a completed event and 404 for an unknown one', async () => {
      const done = t.events.seed({
        instructorId: t.activeInstructor,
        status: 'completed',
      });

      const completed = await http()
        .post(`/api/v1/admin/events/${done.id}/pricing-rules`)
        .set(t.admin)
        .send(valid())
        .expect(403);
      expect(bodyOf(completed).error_code).toBe('EVENT_COMPLETED');
      const unknown = await http()
        .post(`/api/v1/admin/events/${randomUUID()}/pricing-rules`)
        .set(t.admin)
        .send(valid())
        .expect(404);
      expect(bodyOf(unknown).error_code).toBe('EVENT_NOT_FOUND');
    });
  });

  describe('PUT /admin/events/:id/pricing-rules/:ruleId', () => {
    it('replaces the rule and keeps the status when it is omitted', async () => {
      const rule = pricing.seedRule(eventId, {
        minimumQuantity: 2,
        status: 'inactive',
      });

      const res = await http()
        .put(`${base()}/${rule.id}`)
        .set(t.admin)
        .send(
          valid({
            minimum_quantity: 4,
            discount_type: 'fixed_amount',
            discount_value: 5000,
          }),
        )
        .expect(200);
      const body = res.body as Body<Record<string, unknown>>;

      expect(body.message).toBe('Aturan bundle berhasil diperbarui');
      expect(body.data).toMatchObject({
        id: rule.id,
        minimum_quantity: 4,
        discount_type: 'fixed_amount',
        discount_value: 5000,
        status: 'inactive',
      });
    });

    it('can toggle the status and keep its own minimum quantity', async () => {
      const rule = pricing.seedRule(eventId, { minimumQuantity: 2 });

      const res = await http()
        .put(`${base()}/${rule.id}`)
        .set(t.admin)
        .send(valid({ status: 'inactive' }))
        .expect(200);

      expect((res.body as Body<{ status: string }>).data.status).toBe(
        'inactive',
      );
    });

    it('rejects a minimum quantity used by another rule and a percentage over 100', async () => {
      pricing.seedRule(eventId, { minimumQuantity: 2 });
      const rule = pricing.seedRule(eventId, { minimumQuantity: 3 });

      const clash = await http()
        .put(`${base()}/${rule.id}`)
        .set(t.admin)
        .send(valid({ minimum_quantity: 2 }))
        .expect(422);
      expect(bodyOf(clash).errors?.minimum_quantity).toBeDefined();
      await http()
        .put(`${base()}/${rule.id}`)
        .set(t.admin)
        .send(valid({ minimum_quantity: 3, discount_value: 200 }))
        .expect(422);
    });

    it('returns 404 for a rule of another event or an unknown rule, and 403 for a completed event', async () => {
      const other = pricing.seedRule(randomUUID());
      await http()
        .put(`${base()}/${other.id}`)
        .set(t.admin)
        .send(valid())
        .expect(404);
      await http()
        .put(`${base()}/${randomUUID()}`)
        .set(t.admin)
        .send(valid())
        .expect(404);

      const done = t.events.seed({
        instructorId: t.activeInstructor,
        status: 'completed',
      });
      const rule = pricing.seedRule(done.id);
      await http()
        .put(`/api/v1/admin/events/${done.id}/pricing-rules/${rule.id}`)
        .set(t.admin)
        .send(valid())
        .expect(403);
    });
  });

  describe('DELETE /admin/events/:id/pricing-rules/:ruleId', () => {
    it('deletes a rule, 404 afterwards', async () => {
      const rule = pricing.seedRule(eventId);

      const res = await http()
        .delete(`${base()}/${rule.id}`)
        .set(t.admin)
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        message: 'Aturan bundle berhasil dihapus',
      });
      expect(pricing.rules.has(rule.id)).toBe(false);
      await http().delete(`${base()}/${rule.id}`).set(t.admin).expect(404);
    });

    it('does not delete a rule of another event', async () => {
      const other = pricing.seedRule(randomUUID());

      await http().delete(`${base()}/${other.id}`).set(t.admin).expect(404);
      expect(pricing.rules.has(other.id)).toBe(true);
    });
  });
});
