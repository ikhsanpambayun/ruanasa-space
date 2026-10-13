import request from 'supertest';

import { todayInWib } from '../src/common/utils/date.util';
import { DiscountsRepository } from '../src/modules/discounts/discounts.repository';
import {
  createTestApp,
  type AuthHeader,
  type TestApp,
} from './helpers/create-test-app';
import { FakeDiscountsRepository } from './helpers/fake-discounts.repository';
import { bodyOf } from './test-env';

const UNKNOWN_ID = '6f1c2f0e-3a53-4f7e-9f1e-0c6f5b7a1d11';

interface Body<T> {
  success: boolean;
  message: string;
  data: T;
  pagination?: { page: number; per_page: number; total_items: number };
}

/**
 * Tanggal WIB hari ini digeser sekian hari, format YYYY-MM-DD.
 *
 * @param days - Selisih hari (negatif = lampau).
 * @returns Tanggal.
 */
function daysFromToday(days: number): string {
  const [year, month, day] = todayInWib().split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

/** Tanggal UTC tengah malam untuk kolom DATE. */
const asDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

describe('Discount code API (e2e)', () => {
  let ctx: TestApp;
  let repo: FakeDiscountsRepository;
  let admin: AuthHeader;

  const http = (): ReturnType<typeof request> =>
    request(ctx.app.getHttpServer());

  beforeAll(async () => {
    repo = new FakeDiscountsRepository();
    ctx = await createTestApp({
      configure: (builder) =>
        builder.overrideProvider(DiscountsRepository).useValue(repo),
    });
    admin = ctx.asAdmin();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(() => {
    repo.rows.clear();
  });

  describe('access control', () => {
    it('admin endpoints require an admin', async () => {
      await http().get('/api/v1/admin/discount-codes').expect(401);
      await http()
        .get('/api/v1/admin/discount-codes')
        .set(ctx.asParticipant())
        .expect(403);
      await http()
        .post('/api/v1/admin/discount-codes')
        .set(ctx.asParticipant())
        .send({})
        .expect(403);
    });

    it('validate is for participants only', async () => {
      await http()
        .post('/api/v1/discount-codes/validate')
        .send({ code: 'X' })
        .expect(401);
      await http()
        .post('/api/v1/discount-codes/validate')
        .set(admin)
        .send({ code: 'X' })
        .expect(403);
    });
  });

  describe('GET /admin/discount-codes', () => {
    it('lists newest first with pagination metadata (no total_pages)', async () => {
      repo.seed({ code: 'PERTAMA' });
      repo.seed({ code: 'KEDUA' });
      repo.seed({ code: 'KETIGA' });

      const res = await http()
        .get('/api/v1/admin/discount-codes?page=1&per_page=2')
        .set(admin)
        .expect(200);
      const body = res.body as Body<{ code: string }[]>;

      expect(body.data.map((row) => row.code)).toEqual(['KETIGA', 'KEDUA']);
      expect(body.pagination).toEqual({ page: 1, per_page: 2, total_items: 3 });

      const second = await http()
        .get('/api/v1/admin/discount-codes?page=2&per_page=2')
        .set(admin)
        .expect(200);
      expect(
        (second.body as Body<{ code: string }[]>).data.map((row) => row.code),
      ).toEqual(['PERTAMA']);
    });

    it('returns the documented item shape with the expiry as YYYY-MM-DD', async () => {
      repo.seed({
        code: 'HEMAT',
        discountType: 'fixed_amount',
        discountValue: 25000,
        quota: 50,
        usedCount: 12,
        expiryDate: asDate('2030-01-31'),
      });

      const res = await http()
        .get('/api/v1/admin/discount-codes')
        .set(admin)
        .expect(200);

      expect((res.body as Body<unknown[]>).data[0]).toEqual({
        id: expect.any(String) as string,
        code: 'HEMAT',
        discount_type: 'fixed_amount',
        discount_value: 25000,
        quota: 50,
        used_count: 12,
        expiry_date: '2030-01-31',
        status: 'active',
      });
    });

    it('filters by status and defaults to page 1 with 20 per page', async () => {
      repo.seed({ code: 'AKTIF' });
      repo.seed({ code: 'MATI', status: 'inactive' });

      const res = await http()
        .get('/api/v1/admin/discount-codes?status=inactive')
        .set(admin)
        .expect(200);
      const body = res.body as Body<{ code: string }[]>;

      expect(body.data.map((row) => row.code)).toEqual(['MATI']);
      expect(body.pagination).toEqual({
        page: 1,
        per_page: 20,
        total_items: 1,
      });
    });

    it.each([
      'page=0',
      'page=abc',
      'per_page=0',
      'per_page=101',
      'status=banned',
    ])('rejects ?%s with 422', async (query) => {
      await http()
        .get(`/api/v1/admin/discount-codes?${query}`)
        .set(admin)
        .expect(422);
    });
  });

  describe('POST /admin/discount-codes', () => {
    const valid = (): Record<string, unknown> => ({
      code: 'welcome10',
      discount_type: 'percentage',
      discount_value: 10,
      quota: 50,
      expiry_date: daysFromToday(30),
    });

    it('creates a code in uppercase with status active by default (201)', async () => {
      const res = await http()
        .post('/api/v1/admin/discount-codes')
        .set(admin)
        .send(valid())
        .expect(201);
      const body = res.body as Body<Record<string, unknown>>;

      expect(body.message).toBe('Kode promo berhasil dibuat');
      expect(body.data).toMatchObject({
        code: 'WELCOME10',
        discount_type: 'percentage',
        discount_value: 10,
        quota: 50,
        used_count: 0,
        status: 'active',
        expiry_date: daysFromToday(30),
      });
    });

    it('accepts an expiry of tomorrow but rejects today and the past', async () => {
      await http()
        .post('/api/v1/admin/discount-codes')
        .set(admin)
        .send({ ...valid(), code: 'BESOK', expiry_date: daysFromToday(1) })
        .expect(201);

      for (const [code, offset] of [
        ['HARIINI', 0],
        ['KEMARIN', -1],
      ] as const) {
        const res = await http()
          .post('/api/v1/admin/discount-codes')
          .set(admin)
          .send({ ...valid(), code, expiry_date: daysFromToday(offset) })
          .expect(422);
        expect(bodyOf(res).errors?.expiry_date).toContain(
          'Tanggal kedaluwarsa harus di masa depan',
        );
      }
    });

    it('limits percentage to 100 but lets fixed_amount exceed it', async () => {
      const over = await http()
        .post('/api/v1/admin/discount-codes')
        .set(admin)
        .send({ ...valid(), code: 'PERSEN', discount_value: 101 })
        .expect(422);
      expect(bodyOf(over).errors?.discount_value).toBeDefined();

      await http()
        .post('/api/v1/admin/discount-codes')
        .set(admin)
        .send({
          ...valid(),
          code: 'RUPIAH',
          discount_type: 'fixed_amount',
          discount_value: 50000,
        })
        .expect(201);
      await http()
        .post('/api/v1/admin/discount-codes')
        .set(admin)
        .send({ ...valid(), code: 'SERATUS', discount_value: 100 })
        .expect(201);
    });

    it('rejects a duplicate code regardless of letter case with 409 PROMO_CODE_EXISTS', async () => {
      repo.seed({ code: 'WELCOME10' });

      const res = await http()
        .post('/api/v1/admin/discount-codes')
        .set(admin)
        .send(valid())
        .expect(409);

      expect(bodyOf(res)).toEqual({
        success: false,
        message: 'Kode promo ini sudah digunakan',
        error_code: 'PROMO_CODE_EXISTS',
      });
      expect(repo.rows.size).toBe(1);
    });

    it.each([
      ['code with symbols', { code: 'HEMAT-10' }, 'code'],
      ['code with spaces inside', { code: 'HEMAT 10' }, 'code'],
      ['code over 20 characters', { code: 'A'.repeat(21) }, 'code'],
      ['empty code', { code: '' }, 'code'],
      ['unknown discount_type', { discount_type: 'bogus' }, 'discount_type'],
      ['zero discount_value', { discount_value: 0 }, 'discount_value'],
      ['fractional discount_value', { discount_value: 10.5 }, 'discount_value'],
      [
        'numeric string discount_value',
        { discount_value: '10' },
        'discount_value',
      ],
      ['zero quota', { quota: 0 }, 'quota'],
      ['malformed expiry', { expiry_date: '31-12-2030' }, 'expiry_date'],
      [
        'impossible calendar date',
        { expiry_date: '2031-02-31' },
        'expiry_date',
      ],
      [
        'expiry with time part',
        { expiry_date: `${daysFromToday(5)}T10:00:00Z` },
        'expiry_date',
      ],
      ['invalid status', { status: 'banned' }, 'status'],
    ])('rejects %s with 422', async (_label, override, field) => {
      const res = await http()
        .post('/api/v1/admin/discount-codes')
        .set(admin)
        .send({ ...valid(), ...override })
        .expect(422);

      expect(bodyOf(res).errors?.[field]).toBeDefined();
      expect(repo.rows.size).toBe(0);
    });

    it('rejects unknown fields such as used_count', async () => {
      await http()
        .post('/api/v1/admin/discount-codes')
        .set(admin)
        .send({ ...valid(), used_count: 5 })
        .expect(422);
    });
  });

  describe('PUT /admin/discount-codes/:id', () => {
    const update = (): Record<string, unknown> => ({
      discount_type: 'percentage',
      discount_value: 15,
      quota: 80,
      expiry_date: daysFromToday(60),
    });

    it('updates the rules and keeps the code and current status when status is omitted', async () => {
      const row = repo.seed({
        code: 'PROMO',
        status: 'inactive',
        usedCount: 3,
      });

      const res = await http()
        .put(`/api/v1/admin/discount-codes/${row.id}`)
        .set(admin)
        .send(update())
        .expect(200);
      const body = res.body as Body<Record<string, unknown>>;

      expect(body.message).toBe('Kode promo berhasil diperbarui');
      expect(body.data).toMatchObject({
        code: 'PROMO',
        discount_value: 15,
        quota: 80,
        used_count: 3,
        status: 'inactive',
        expiry_date: daysFromToday(60),
      });
    });

    it('can toggle the status', async () => {
      const row = repo.seed({ code: 'PROMO' });

      const res = await http()
        .put(`/api/v1/admin/discount-codes/${row.id}`)
        .set(admin)
        .send({ ...update(), status: 'inactive' })
        .expect(200);

      expect((res.body as Body<{ status: string }>).data.status).toBe(
        'inactive',
      );
    });

    it('does not allow changing the code', async () => {
      const row = repo.seed({ code: 'PROMO' });

      await http()
        .put(`/api/v1/admin/discount-codes/${row.id}`)
        .set(admin)
        .send({ ...update(), code: 'LAIN' })
        .expect(422);
      expect(repo.rows.get(row.id)?.code).toBe('PROMO');
    });

    it('rejects a quota below the number of uses with 422', async () => {
      const row = repo.seed({ code: 'PROMO', usedCount: 40 });

      const res = await http()
        .put(`/api/v1/admin/discount-codes/${row.id}`)
        .set(admin)
        .send({ ...update(), quota: 39 })
        .expect(422);

      expect(bodyOf(res).errors?.quota?.[0]).toContain('(40)');
      await http()
        .put(`/api/v1/admin/discount-codes/${row.id}`)
        .set(admin)
        .send({ ...update(), quota: 40 })
        .expect(200);
    });

    it('allows a past expiry date so an expired code can still be deactivated', async () => {
      const row = repo.seed({ code: 'LAMA' });

      await http()
        .put(`/api/v1/admin/discount-codes/${row.id}`)
        .set(admin)
        .send({
          ...update(),
          expiry_date: daysFromToday(-10),
          status: 'inactive',
        })
        .expect(200);
    });

    it('limits percentage to 100 on update too', async () => {
      const row = repo.seed({ code: 'PROMO' });

      await http()
        .put(`/api/v1/admin/discount-codes/${row.id}`)
        .set(admin)
        .send({ ...update(), discount_value: 150 })
        .expect(422);
    });

    it('returns 404 for unknown and malformed ids', async () => {
      const unknown = await http()
        .put(`/api/v1/admin/discount-codes/${UNKNOWN_ID}`)
        .set(admin)
        .send(update())
        .expect(404);
      expect(bodyOf(unknown).error_code).toBe('NOT_FOUND');
      await http()
        .put('/api/v1/admin/discount-codes/abc')
        .set(admin)
        .send(update())
        .expect(404);
    });
  });

  describe('POST /discount-codes/validate', () => {
    let participant: AuthHeader;

    beforeEach(() => {
      participant = ctx.asParticipant();
    });

    const validate = (code: unknown): request.Test =>
      http()
        .post('/api/v1/discount-codes/validate')
        .set(participant)
        .send({ code });

    it('accepts a valid code case-insensitively and returns the discount to apply', async () => {
      const row = repo.seed({
        code: 'WELCOME10',
        discountType: 'percentage',
        discountValue: 10,
      });

      const res = await validate(' welcome10 ').expect(200);

      expect(res.body).toEqual({
        success: true,
        message: 'Kode promo berhasil diterapkan',
        data: {
          discount_code_id: row.id,
          code: 'WELCOME10',
          discount_type: 'percentage',
          discount_value: 10,
        },
      });
    });

    it('rejects an unknown code with 400 INVALID_PROMO (also for absurdly long input)', async () => {
      const res = await validate('TIDAKADA').expect(400);
      expect(bodyOf(res)).toEqual({
        success: false,
        message: 'Kode promo tidak valid',
        error_code: 'INVALID_PROMO',
      });
      await validate('X'.repeat(60)).expect(400);
    });

    it('rejects an inactive code with 400 PROMO_INACTIVE', async () => {
      repo.seed({ code: 'MATI', status: 'inactive' });

      const res = await validate('MATI').expect(400);

      expect(bodyOf(res)).toMatchObject({
        error_code: 'PROMO_INACTIVE',
        message: 'Kode promo tidak aktif',
      });
    });

    it('rejects an expired code with 400 PROMO_EXPIRED', async () => {
      repo.seed({ code: 'BASI', expiryDate: asDate(daysFromToday(-1)) });

      const res = await validate('BASI').expect(400);

      expect(bodyOf(res)).toMatchObject({
        error_code: 'PROMO_EXPIRED',
        message: 'Kode promo sudah expired',
      });
    });

    it('still accepts a code on its expiry date (valid through the end of that day)', async () => {
      repo.seed({ code: 'HARIINI', expiryDate: asDate(daysFromToday(0)) });

      await validate('HARIINI').expect(200);
    });

    it('rejects a code whose quota is used up with 400 PROMO_QUOTA_EXHAUSTED', async () => {
      repo.seed({ code: 'HABIS', quota: 5, usedCount: 5 });

      const res = await validate('HABIS').expect(400);

      expect(bodyOf(res)).toMatchObject({
        error_code: 'PROMO_QUOTA_EXHAUSTED',
        message: 'Kode promo sudah habis',
      });
    });

    it('accepts a code with exactly one use left', async () => {
      repo.seed({ code: 'SISA1', quota: 5, usedCount: 4 });

      await validate('SISA1').expect(200);
    });

    it('reports the inactive state before expiry or quota problems', async () => {
      repo.seed({
        code: 'KOMBO',
        status: 'inactive',
        expiryDate: asDate(daysFromToday(-5)),
        quota: 1,
        usedCount: 1,
      });

      const res = await validate('KOMBO').expect(400);

      expect(bodyOf(res).error_code).toBe('PROMO_INACTIVE');
    });

    it.each([[undefined], [''], ['   '], [123]])(
      'rejects a missing or non-text code (%p) with 422',
      async (code) => {
        await validate(code).expect(422);
      },
    );
  });
});

describe('Promo validation rate limit (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp({
      configure: (builder) =>
        builder
          .overrideProvider(DiscountsRepository)
          .useValue(new FakeDiscountsRepository()),
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('allows 20 validations per minute and returns 429 RATE_LIMITED on the 21st (anti brute-force)', async () => {
    const auth = ctx.asParticipant();
    const attempt = (): request.Test =>
      request(ctx.app.getHttpServer())
        .post('/api/v1/discount-codes/validate')
        .set(auth)
        .send({ code: 'TEBAK' });

    for (let i = 1; i <= 20; i += 1) {
      await attempt().expect(400);
    }
    const res = await attempt().expect(429);

    expect(bodyOf(res).error_code).toBe('RATE_LIMITED');
  });
});
