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
 * Dilempar saat harga tidak (lagi) ada pada event ketika transaksi berjalan, mis. dihapus oleh request lain.
 */
export class PriceNotFoundError extends Error {
  constructor() {
    super('The price no longer exists for the event');
    this.name = 'PriceNotFoundError';
  }
}

/**
 * Pemeriksaan bisnis yang dijalankan di dalam transaksi terkunci. Melempar exception bila perubahan tidak boleh dilakukan.
 *
 * @param activePrices - Harga berstatus active pada event saat kunci sudah dipegang.
 */
export type PriceGuard = (activePrices: EventPrice[]) => void;

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
   * @param priceId - UUID harga.
   * @returns Harga milik event tersebut, atau null.
   */
  findPrice(eventId: string, priceId: string): Promise<EventPrice | null> {
    return this.prisma.eventPrice.findFirst({
      where: { id: priceId, eventId },
    });
  }

  /**
   * Membuat harga bila `guard` menyetujui. Seluruh langkah berjalan dalam satu transaksi yang mengunci baris event
   * (SELECT ... FOR UPDATE), sehingga perubahan harga bersamaan pada event yang sama berjalan berurutan dan
   * pemeriksaan keunikan tidak bisa dilewati dua request yang datang bersamaan.
   *
   * @param eventId - UUID event.
   * @param data - Data harga.
   * @param guard - Pemeriksaan bisnis atas harga aktif event.
   * @returns Harga yang dibuat.
   */
  createPrice(
    eventId: string,
    data: PriceData,
    guard: PriceGuard,
  ): Promise<EventPrice> {
    return this.prisma.$transaction(async (tx) => {
      guard(await this.lockEventAndListActivePrices(tx, eventId));
      return tx.eventPrice.create({ data: { eventId, ...data } });
    });
  }

  /**
   * Memperbarui harga bila `guard` menyetujui; berjalan dalam transaksi terkunci seperti {@link createPrice}.
   *
   * @param eventId - UUID event.
   * @param id - UUID harga.
   * @param data - Data baru.
   * @param guard - Pemeriksaan bisnis atas harga aktif event.
   * @returns Harga setelah diperbarui.
   * @throws PriceNotFoundError bila harga sudah tidak ada pada event.
   */
  updatePrice(
    eventId: string,
    id: string,
    data: PriceData,
    guard: PriceGuard,
  ): Promise<EventPrice> {
    return this.prisma.$transaction(async (tx) => {
      guard(await this.lockEventAndListActivePrices(tx, eventId));
      const { count } = await tx.eventPrice.updateMany({
        where: { id, eventId },
        data,
      });
      if (count === 0) {
        throw new PriceNotFoundError();
      }
      return tx.eventPrice.findUniqueOrThrow({ where: { id } });
    });
  }

  /**
   * Menghapus harga bila `guard` menyetujui; berjalan dalam transaksi terkunci seperti {@link createPrice}.
   * Registrasi menyimpan total hasil perhitungannya sendiri sehingga tidak merujuk baris harga.
   *
   * @param eventId - UUID event.
   * @param id - UUID harga.
   * @param guard - Pemeriksaan bisnis atas harga aktif event.
   * @throws PriceNotFoundError bila harga sudah tidak ada pada event.
   */
  deletePrice(eventId: string, id: string, guard: PriceGuard): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      guard(await this.lockEventAndListActivePrices(tx, eventId));
      const { count } = await tx.eventPrice.deleteMany({
        where: { id, eventId },
      });
      if (count === 0) {
        throw new PriceNotFoundError();
      }
    });
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

  /**
   * Mengunci baris event lalu membaca harga aktifnya. Pembacaan dilakukan SETELAH kunci didapat agar melihat
   * hasil transaksi lain yang sebelumnya memegang kunci yang sama.
   *
   * @param tx - Klien transaksi.
   * @param eventId - UUID event.
   * @returns Harga berstatus active pada event.
   */
  private async lockEventAndListActivePrices(
    tx: Prisma.TransactionClient,
    eventId: string,
  ): Promise<EventPrice[]> {
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId}::uuid FOR UPDATE`;
    return tx.eventPrice.findMany({ where: { eventId, status: 'active' } });
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
