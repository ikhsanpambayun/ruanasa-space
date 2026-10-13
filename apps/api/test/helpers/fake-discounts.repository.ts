import { randomUUID } from 'node:crypto';

import type { ActiveStatus, DiscountCode } from '@prisma/client';

import {
  DiscountCodeTakenError,
  type CreateDiscountCodeData,
  type UpdateDiscountCodeData,
} from '../../src/modules/discounts/discounts.repository';

/**
 * Repository kode promo in-memory untuk test. Meniru unique `code` dan urutan terbaru lebih dulu.
 */
export class FakeDiscountsRepository {
  readonly rows = new Map<string, DiscountCode>();
  private sequence = 0;

  /** Menambah kode promo awal; `createdAt` bertambah per pemanggilan agar urutan deterministik. */
  seed(overrides: Partial<DiscountCode> & { code: string }): DiscountCode {
    this.sequence += 1;
    const row: DiscountCode = {
      id: randomUUID(),
      discountType: 'percentage',
      discountValue: 10,
      quota: 100,
      usedCount: 0,
      expiryDate: new Date('2099-12-31T00:00:00Z'),
      status: 'active',
      createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, this.sequence)),
      updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, this.sequence)),
      ...overrides,
    };
    this.rows.set(row.id, row);
    return row;
  }

  findMany(filter: {
    status?: ActiveStatus;
    skip: number;
    take: number;
  }): Promise<{ rows: DiscountCode[]; total: number }> {
    const matching = [...this.rows.values()]
      .filter((row) => !filter.status || row.status === filter.status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve({
      rows: matching.slice(filter.skip, filter.skip + filter.take),
      total: matching.length,
    });
  }

  findById(id: string): Promise<DiscountCode | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findByCode(code: string): Promise<DiscountCode | null> {
    return Promise.resolve(
      [...this.rows.values()].find((row) => row.code === code) ?? null,
    );
  }

  create(data: CreateDiscountCodeData): Promise<DiscountCode> {
    if ([...this.rows.values()].some((row) => row.code === data.code)) {
      return Promise.reject(new DiscountCodeTakenError());
    }
    return Promise.resolve(this.seed({ ...data }));
  }

  update(id: string, data: UpdateDiscountCodeData): Promise<DiscountCode> {
    const existing = this.rows.get(id);
    if (!existing) {
      return Promise.reject(new Error('Discount code not found'));
    }
    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.rows.set(id, updated);
    return Promise.resolve(updated);
  }
}
