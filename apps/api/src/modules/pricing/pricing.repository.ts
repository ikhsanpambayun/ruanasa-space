import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type ActiveStatus,
  type DiscountType,
  type EventPrice,
  type EventPricingRule,
  type PriceType,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

/** Data harga event. */
export interface PriceData {
  priceType: PriceType;
  price: number;
  /** Tanggal (UTC tengah malam); wajib untuk early_bird, null untuk normal. */
  startDate: Date | null;
  endDate: Date | null;
  status: ActiveStatus;
}

/** Data aturan bundle. */
export interface PricingRuleData {
  minimumQuantity: number;
  discountType: DiscountType;
  discountValue: number;
  status: ActiveStatus;
}

/**
 * Dilempar saat sudah ada aturan bundle dengan jumlah minimum yang sama pada event (unique constraint).
 */
export class PricingRuleQuantityTakenError extends Error {
  constructor() {
    super(
      'A bundle rule with this minimum quantity already exists for the event',
    );
    this.name = 'PricingRuleQuantityTakenError';
  }
}

/**
 * Akses data tabel event_prices dan event_pricing_rules.
 */
@Injectable()
export class PricingRepository {
  /**
   * @param prisma - Prisma client.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param eventId - UUID event.
   * @returns Semua harga (normal lebih dulu, lalu menurut tanggal mulai) dan aturan bundle (jumlah minimum naik).
   */
  async findAllForEvent(
    eventId: string,
  ): Promise<{ prices: EventPrice[]; rules: EventPricingRule[] }> {
    const [prices, rules] = await Promise.all([
      this.prisma.eventPrice.findMany({
        where: { eventId },
        orderBy: [
          { priceType: 'asc' },
          { startDate: 'asc' },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
      }),
      this.prisma.eventPricingRule.findMany({
        where: { eventId },
        orderBy: [{ minimumQuantity: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return { prices, rules };
  }

  /**
   * @param eventId - UUID event.
   * @returns Harga berstatus active pada event (dasar validasi keunikan dan periode).
   */
  listActivePrices(eventId: string): Promise<EventPrice[]> {
    return this.prisma.eventPrice.findMany({
      where: { eventId, status: 'active' },
    });
  }

  /**
   * @param eventId - UUID event.
   * @param priceId - UUID harga.
   * @returns Harga milik event tersebut, atau null.
   */
  findPrice(eventId: string, priceId: string): Promise<EventPrice | null> {
    return this.prisma.eventPrice.findFirst({
      where: { id: priceId, eventId },
    });
  }

  /**
   * @param eventId - UUID event.
   * @param data - Data harga.
   * @returns Harga yang dibuat.
   */
  createPrice(eventId: string, data: PriceData): Promise<EventPrice> {
    return this.prisma.eventPrice.create({ data: { eventId, ...data } });
  }

  /**
   * @param id - UUID harga.
   * @param data - Data baru.
   * @returns Harga setelah diperbarui.
   */
  updatePrice(id: string, data: PriceData): Promise<EventPrice> {
    return this.prisma.eventPrice.update({ where: { id }, data });
  }

  /**
   * @param id - UUID harga. Registrasi menyimpan total hasil perhitungan sendiri sehingga tidak merujuk baris harga.
   */
  async deletePrice(id: string): Promise<void> {
    await this.prisma.eventPrice.delete({ where: { id } });
  }

  /**
   * @param eventId - UUID event.
   * @param ruleId - UUID aturan.
   * @returns Aturan milik event tersebut, atau null.
   */
  findRule(eventId: string, ruleId: string): Promise<EventPricingRule | null> {
    return this.prisma.eventPricingRule.findFirst({
      where: { id: ruleId, eventId },
    });
  }

  /**
   * @param eventId - UUID event.
   * @param minimumQuantity - Jumlah minimum peserta.
   * @returns Aturan bundle dengan jumlah minimum tersebut, atau null.
   */
  findRuleByQuantity(
    eventId: string,
    minimumQuantity: number,
  ): Promise<EventPricingRule | null> {
    return this.prisma.eventPricingRule.findFirst({
      where: { eventId, ruleType: 'bundle', minimumQuantity },
    });
  }

  /**
   * @param eventId - UUID event.
   * @param data - Data aturan.
   * @returns Aturan yang dibuat.
   * @throws PricingRuleQuantityTakenError bila jumlah minimum sudah dipakai.
   */
  async createRule(
    eventId: string,
    data: PricingRuleData,
  ): Promise<EventPricingRule> {
    try {
      return await this.prisma.eventPricingRule.create({
        data: { eventId, ruleType: 'bundle', ...data },
      });
    } catch (error) {
      throw this.translate(error);
    }
  }

  /**
   * @param id - UUID aturan.
   * @param data - Data baru.
   * @returns Aturan setelah diperbarui.
   * @throws PricingRuleQuantityTakenError bila jumlah minimum bentrok dengan aturan lain.
   */
  async updateRule(
    id: string,
    data: PricingRuleData,
  ): Promise<EventPricingRule> {
    try {
      return await this.prisma.eventPricingRule.update({ where: { id }, data });
    } catch (error) {
      throw this.translate(error);
    }
  }

  /**
   * @param id - UUID aturan.
   */
  async deleteRule(id: string): Promise<void> {
    await this.prisma.eventPricingRule.delete({ where: { id } });
  }

  private translate(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new PricingRuleQuantityTakenError();
    }
    return error;
  }
}
