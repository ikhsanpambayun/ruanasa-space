import { randomUUID } from 'node:crypto';

import type { EventPrice, EventPricingRule } from '@prisma/client';

import {
  PricingRuleQuantityTakenError,
  type PriceData,
  type PricingRuleData,
} from '../../src/modules/pricing/pricing.repository';

/**
 * Repository harga dan aturan bundle in-memory untuk test. Meniru unique (event, rule_type, minimum_quantity).
 */
export class FakePricingRepository {
  readonly prices = new Map<string, EventPrice>();
  readonly rules = new Map<string, EventPricingRule>();
  private sequence = 0;

  /** Menambah harga awal. */
  seedPrice(eventId: string, overrides: Partial<EventPrice> = {}): EventPrice {
    this.sequence += 1;
    const price: EventPrice = {
      id: randomUUID(),
      eventId,
      priceType: 'normal',
      price: 150000,
      startDate: null,
      endDate: null,
      status: 'active',
      createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, this.sequence)),
      ...overrides,
    };
    this.prices.set(price.id, price);
    return price;
  }

  /** Menambah aturan bundle awal. */
  seedRule(
    eventId: string,
    overrides: Partial<EventPricingRule> = {},
  ): EventPricingRule {
    this.sequence += 1;
    const rule: EventPricingRule = {
      id: randomUUID(),
      eventId,
      ruleType: 'bundle',
      minimumQuantity: 2,
      discountType: 'percentage',
      discountValue: 10,
      status: 'active',
      createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, this.sequence)),
      ...overrides,
    };
    this.rules.set(rule.id, rule);
    return rule;
  }

  findAllForEvent(
    eventId: string,
  ): Promise<{ prices: EventPrice[]; rules: EventPricingRule[] }> {
    // Meniru ORDER BY price_type (urutan deklarasi enum: normal, early_bird), start_date (NULL terakhir), created_at.
    const typeRank = (p: EventPrice): number =>
      p.priceType === 'normal' ? 0 : 1;
    const startTime = (p: EventPrice): number =>
      p.startDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const prices = [...this.prices.values()]
      .filter((p) => p.eventId === eventId)
      .sort((a, b) => {
        const byStart = startTime(a) - startTime(b);
        return (
          typeRank(a) - typeRank(b) ||
          (Number.isNaN(byStart) ? 0 : byStart) ||
          a.createdAt.getTime() - b.createdAt.getTime()
        );
      });
    const rules = [...this.rules.values()]
      .filter((r) => r.eventId === eventId)
      .sort((a, b) => a.minimumQuantity - b.minimumQuantity);
    return Promise.resolve({ prices, rules });
  }

  listActivePrices(eventId: string): Promise<EventPrice[]> {
    return Promise.resolve(
      [...this.prices.values()].filter(
        (p) => p.eventId === eventId && p.status === 'active',
      ),
    );
  }

  findPrice(eventId: string, priceId: string): Promise<EventPrice | null> {
    const price = this.prices.get(priceId);
    return Promise.resolve(price && price.eventId === eventId ? price : null);
  }

  createPrice(eventId: string, data: PriceData): Promise<EventPrice> {
    return Promise.resolve(this.seedPrice(eventId, data));
  }

  updatePrice(id: string, data: PriceData): Promise<EventPrice> {
    const updated = { ...(this.prices.get(id) as EventPrice), ...data };
    this.prices.set(id, updated);
    return Promise.resolve(updated);
  }

  deletePrice(id: string): Promise<void> {
    this.prices.delete(id);
    return Promise.resolve();
  }

  findRule(eventId: string, ruleId: string): Promise<EventPricingRule | null> {
    const rule = this.rules.get(ruleId);
    return Promise.resolve(rule && rule.eventId === eventId ? rule : null);
  }

  findRuleByQuantity(
    eventId: string,
    minimumQuantity: number,
  ): Promise<EventPricingRule | null> {
    return Promise.resolve(
      [...this.rules.values()].find(
        (r) => r.eventId === eventId && r.minimumQuantity === minimumQuantity,
      ) ?? null,
    );
  }

  createRule(
    eventId: string,
    data: PricingRuleData,
  ): Promise<EventPricingRule> {
    if (this.hasQuantity(eventId, data.minimumQuantity, null)) {
      return Promise.reject(new PricingRuleQuantityTakenError());
    }
    return Promise.resolve(this.seedRule(eventId, data));
  }

  updateRule(id: string, data: PricingRuleData): Promise<EventPricingRule> {
    const existing = this.rules.get(id) as EventPricingRule;
    if (this.hasQuantity(existing.eventId, data.minimumQuantity, id)) {
      return Promise.reject(new PricingRuleQuantityTakenError());
    }
    const updated = { ...existing, ...data };
    this.rules.set(id, updated);
    return Promise.resolve(updated);
  }

  deleteRule(id: string): Promise<void> {
    this.rules.delete(id);
    return Promise.resolve();
  }

  private hasQuantity(
    eventId: string,
    quantity: number,
    exceptId: string | null,
  ): boolean {
    return [...this.rules.values()].some(
      (r) =>
        r.eventId === eventId &&
        r.minimumQuantity === quantity &&
        r.id !== exceptId,
    );
  }
}
