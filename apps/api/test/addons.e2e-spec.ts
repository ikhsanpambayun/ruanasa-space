import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { AddonsRepository } from '../src/modules/addons/addons.repository';
import {
  setupEventsApp,
  type EventsTestContext,
} from './helpers/events-test-setup';
import { FakeAddonsRepository } from './helpers/fake-addons.repository';
import { bodyOf } from './test-env';

interface Body<T> {
  success: boolean;
  message: string;
  data: T;
}

describe('Event add-ons API (e2e)', () => {
  let t: EventsTestContext;
  let addons: FakeAddonsRepository;
  let eventId: string;

  const http = (): ReturnType<typeof request> =>
    request(t.ctx.app.getHttpServer());
  const base = (): string => `/api/v1/admin/events/${eventId}/addons`;
  const valid = (
    override: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    name: 'Sewa Yoga Mat',
    description: 'Mat bersih untuk dipakai selama kelas',
    price: 25000,
    available_quantity: 20,
    max_purchase_quantity: 3,
    ...override,
  });

  beforeAll(async () => {
    addons = new FakeAddonsRepository();
    t = await setupEventsApp((builder) =>
      builder.overrideProvider(AddonsRepository).useValue(addons),
    );
  });

  afterAll(async () => {
    await t.ctx.app.close();
  });

  beforeEach(() => {
    t.events.events.clear();
    addons.addons.clear();
    addons.usedAddonIds.clear();
    eventId = t.events.seed({ instructorId: t.activeInstructor }).id;
  });

  it('requires an admin for every endpoint', async () => {
    const id = randomUUID();
    for (const [method, path] of [
      ['get', `/api/v1/admin/events/${id}/addons`],
      ['post', `/api/v1/admin/events/${id}/addons`],
      ['put', `/api/v1/admin/events/${id}/addons/${id}`],
      ['delete', `/api/v1/admin/events/${id}/addons/${id}`],
    ] as const) {
      await http()[method](path).expect(401);
      await http()[method](path).set(t.ctx.asParticipant()).expect(403);
    }
  });

  describe('GET /admin/events/:id/addons', () => {
    it('lists every add-on of the event, including inactive ones, in the documented shape', async () => {
      const mat = addons.seed(eventId, { name: 'Mat', description: 'Bersih' });
      addons.seed(eventId, {
        name: 'Handuk',
        status: 'inactive',
        availableQuantity: 0,
      });
      addons.seed(randomUUID(), { name: 'Milik event lain' });

      const res = await http().get(base()).set(t.admin).expect(200);
      const data = (res.body as Body<Record<string, unknown>[]>).data;

      expect(data.map((a) => a.name)).toEqual(['Mat', 'Handuk']);
      expect(data[0]).toEqual({
        id: mat.id,
        name: 'Mat',
        description: 'Bersih',
        price: 25000,
        available_quantity: 20,
        max_purchase_quantity: 2,
        status: 'active',
      });
      expect(data[1]).toMatchObject({
        status: 'inactive',
        available_quantity: 0,
      });
    });

    it('returns 404 EVENT_NOT_FOUND for an unknown event', async () => {
      const res = await http()
        .get(`/api/v1/admin/events/${randomUUID()}/addons`)
        .set(t.admin)
        .expect(404);

      expect(bodyOf(res).error_code).toBe('EVENT_NOT_FOUND');
    });
  });

  describe('POST /admin/events/:id/addons', () => {
    it('creates an add-on (201) that is active by default and tied to the event', async () => {
      const res = await http()
        .post(base())
        .set(t.admin)
        .send(valid({ name: '  Sewa Mat  ' }))
        .expect(201);
      const body = res.body as Body<Record<string, unknown>>;

      expect(body.message).toBe('Add-on berhasil ditambahkan');
      expect(body.data).toMatchObject({
        name: 'Sewa Mat',
        price: 25000,
        available_quantity: 20,
        max_purchase_quantity: 3,
        status: 'active',
      });
      expect([...addons.addons.values()][0]?.eventId).toBe(eventId);
    });

    it('accepts a free add-on, zero stock, null or blank description, and an explicit inactive status', async () => {
      const res = await http()
        .post(base())
        .set(t.admin)
        .send(
          valid({
            price: 0,
            available_quantity: 0,
            description: '  ',
            status: 'inactive',
          }),
        )
        .expect(201);

      expect((res.body as Body<unknown>).data).toMatchObject({
        price: 0,
        available_quantity: 0,
        description: null,
        status: 'inactive',
      });
      await http()
        .post(base())
        .set(t.admin)
        .send(valid({ description: null }))
        .expect(201);
    });

    it('works on published events too', async () => {
      t.events.events.set(eventId, {
        ...(t.events.events.get(eventId) as NonNullable<
          ReturnType<typeof t.events.events.get>
        >),
        status: 'published',
      });

      await http().post(base()).set(t.admin).send(valid()).expect(201);
    });

    it.each([
      ['missing name', { name: undefined }, 'name'],
      ['blank name', { name: '  ' }, 'name'],
      ['name over 100', { name: 'x'.repeat(101) }, 'name'],
      ['description over 500', { description: 'x'.repeat(501) }, 'description'],
      ['missing price', { price: undefined }, 'price'],
      ['negative price', { price: -1 }, 'price'],
      ['fractional price', { price: 1.5 }, 'price'],
      ['string price', { price: '25000' }, 'price'],
      ['negative stock', { available_quantity: -1 }, 'available_quantity'],
      ['fractional stock', { available_quantity: 2.5 }, 'available_quantity'],
      [
        'missing stock',
        { available_quantity: undefined },
        'available_quantity',
      ],
      [
        'zero max_purchase_quantity',
        { max_purchase_quantity: 0 },
        'max_purchase_quantity',
      ],
      [
        'missing max_purchase_quantity',
        { max_purchase_quantity: undefined },
        'max_purchase_quantity',
      ],
      ['invalid status', { status: 'banned' }, 'status'],
    ])('rejects %s with 422', async (_label, override, field) => {
      const res = await http()
        .post(base())
        .set(t.admin)
        .send(valid(override))
        .expect(422);

      expect(bodyOf(res).errors?.[field]).toBeDefined();
      expect(addons.addons.size).toBe(0);
    });

    it('rejects unknown fields such as event_id', async () => {
      await http()
        .post(base())
        .set(t.admin)
        .send(valid({ event_id: randomUUID() }))
        .expect(422);
    });

    it('returns 403 EVENT_COMPLETED for a completed event and 404 for an unknown one', async () => {
      const done = t.events.seed({
        instructorId: t.activeInstructor,
        status: 'completed',
      });

      const completed = await http()
        .post(`/api/v1/admin/events/${done.id}/addons`)
        .set(t.admin)
        .send(valid())
        .expect(403);
      expect(bodyOf(completed).error_code).toBe('EVENT_COMPLETED');
      await http()
        .post(`/api/v1/admin/events/${randomUUID()}/addons`)
        .set(t.admin)
        .send(valid())
        .expect(404);
    });
  });

  describe('PUT /admin/events/:id/addons/:addonId', () => {
    it('replaces all data, resets an omitted description, and keeps the status when omitted', async () => {
      const addon = addons.seed(eventId, {
        description: 'Lama',
        status: 'inactive',
      });

      const res = await http()
        .put(`${base()}/${addon.id}`)
        .set(t.admin)
        .send({
          name: 'Baru',
          price: 30000,
          available_quantity: 8,
          max_purchase_quantity: 1,
        })
        .expect(200);
      const body = res.body as Body<Record<string, unknown>>;

      expect(body.message).toBe('Add-on berhasil diperbarui');
      expect(body.data).toMatchObject({
        id: addon.id,
        name: 'Baru',
        description: null,
        price: 30000,
        available_quantity: 8,
        status: 'inactive',
      });
    });

    it('toggles the status between active and inactive', async () => {
      const addon = addons.seed(eventId);

      const off = await http()
        .put(`${base()}/${addon.id}`)
        .set(t.admin)
        .send(valid({ status: 'inactive' }))
        .expect(200);
      expect((off.body as Body<{ status: string }>).data.status).toBe(
        'inactive',
      );
      const on = await http()
        .put(`${base()}/${addon.id}`)
        .set(t.admin)
        .send(valid({ status: 'active' }))
        .expect(200);
      expect((on.body as Body<{ status: string }>).data.status).toBe('active');
    });

    it('returns 404 for an add-on of another event or an unknown add-on, and 403 for a completed event', async () => {
      const other = addons.seed(randomUUID());
      const res = await http()
        .put(`${base()}/${other.id}`)
        .set(t.admin)
        .send(valid())
        .expect(404);
      expect(bodyOf(res).error_code).toBe('NOT_FOUND');
      await http()
        .put(`${base()}/${randomUUID()}`)
        .set(t.admin)
        .send(valid())
        .expect(404);

      const done = t.events.seed({
        instructorId: t.activeInstructor,
        status: 'completed',
      });
      const addon = addons.seed(done.id);
      await http()
        .put(`/api/v1/admin/events/${done.id}/addons/${addon.id}`)
        .set(t.admin)
        .send(valid())
        .expect(403);
    });
  });

  describe('DELETE /admin/events/:id/addons/:addonId', () => {
    it('deletes an add-on that no registration uses', async () => {
      const addon = addons.seed(eventId);

      const res = await http()
        .delete(`${base()}/${addon.id}`)
        .set(t.admin)
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        message: 'Add-on berhasil dihapus',
      });
      expect(addons.addons.has(addon.id)).toBe(false);
    });

    it('refuses to delete an add-on already used by a registration and tells the admin to deactivate it', async () => {
      const addon = addons.seed(eventId);
      addons.usedAddonIds.add(addon.id);

      const res = await http()
        .delete(`${base()}/${addon.id}`)
        .set(t.admin)
        .expect(422);

      expect(bodyOf(res).error_code).toBe('VALIDATION_ERROR');
      expect(bodyOf(res).message).toContain('Nonaktifkan add-on');
      expect(addons.addons.has(addon.id)).toBe(true);
    });

    it('returns 404 for unknown add-ons and 403 for a completed event', async () => {
      await http().delete(`${base()}/${randomUUID()}`).set(t.admin).expect(404);

      const done = t.events.seed({
        instructorId: t.activeInstructor,
        status: 'completed',
      });
      const addon = addons.seed(done.id);
      await http()
        .delete(`/api/v1/admin/events/${done.id}/addons/${addon.id}`)
        .set(t.admin)
        .expect(403);
    });
  });
});
