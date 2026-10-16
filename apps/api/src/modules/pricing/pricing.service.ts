import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  ActiveStatus,
  DiscountType,
  Event,
  EventPrice,
  EventPricingRule,
  PriceType,
} from '@prisma/client';

import { ERROR_CODES } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { formatDateOnly, parseDateOnly } from '../../common/utils/date.util';
import { EventsService } from '../events/events.service';
import type { PriceBodyDto, PricingRuleBodyDto } from './dto/pricing.dto';
import {
  PricingRepository,
  PricingRuleQuantityTakenError,
  type PriceData,
  type PricingRuleData,
} from './pricing.repository';

/** Harga event pada response (API Spec v1.6 Section 10.1). */
export interface PriceResponse {
  id: string;
  price_type: PriceType;
  price: number;
  start_date: string | null;
  end_date: string | null;
  status: ActiveStatus;
}

/** Aturan bundle pada response (API Spec v1.6 Section 10.1). */
export interface PricingRuleResponse {
  id: string;
  rule_type: 'bundle';
  minimum_quantity: number;
  discount_type: DiscountType;
  discount_value: number;
  status: ActiveStatus;
}

/** Harga dan aturan bundle suatu event. */
export interface EventPricingResponse {
  prices: PriceResponse[];
  pricing_rules: PricingRuleResponse[];
}

const MAX_PERCENTAGE = 100;

/**
 * Logika bisnis harga event (harga normal, early bird) dan aturan diskon bundle.
 *
 * Aturan yang dijaga agar perhitungan harga (Phase 4) tidak ambigu:
 * - satu event hanya punya satu harga normal berstatus active;
 * - periode early bird yang active tidak boleh bertabrakan;
 * - event published selalu punya minimal satu harga normal active.
 */
@Injectable()
export class PricingService {
  /**
   * @param repository - Repository harga.
   * @param events - Service event (validasi keberadaan dan status event).
   */
  constructor(
    private readonly repository: PricingRepository,
    private readonly events: EventsService,
  ) {}

  /**
   * @param eventId - UUID event.
   * @returns Semua harga dan aturan bundle event.
   * @throws AppException 404 EVENT_NOT_FOUND.
   */
  async getPricing(eventId: string): Promise<EventPricingResponse> {
    await this.events.requireEvent(eventId);
    const { prices, rules } = await this.repository.findAllForEvent(eventId);
    return {
      prices: prices.map(toPriceResponse),
      pricing_rules: rules.map(toRuleResponse),
    };
  }

  /**
   * Menambah harga. Early bird wajib memiliki periode; harga normal tidak boleh memilikinya.
   *
   * @param eventId - UUID event.
   * @param dto - Data harga.
   * @returns Harga yang dibuat.
   * @throws AppException 404; 403 EVENT_COMPLETED; 422 untuk data tidak valid.
   */
  async createPrice(
    eventId: string,
    dto: PriceBodyDto,
  ): Promise<PriceResponse> {
    await this.events.requireEditableEvent(eventId);
    const data = toPriceData(dto, 'active');
    await this.assertPriceRules(eventId, data, null);
    return toPriceResponse(await this.repository.createPrice(eventId, data));
  }

  /**
   * Mengganti seluruh data harga. `status` yang tidak dikirim dipertahankan. Event published tidak boleh
   * kehilangan harga normal aktif terakhirnya.
   *
   * @param eventId - UUID event.
   * @param priceId - UUID harga.
   * @param dto - Data baru.
   * @returns Harga setelah diperbarui.
   * @throws AppException 404; 403 EVENT_COMPLETED; 400 MISSING_PRICE; 422 untuk data tidak valid.
   */
  async updatePrice(
    eventId: string,
    priceId: string,
    dto: PriceBodyDto,
  ): Promise<PriceResponse> {
    const event = await this.events.requireEditableEvent(eventId);
    const existing = await this.getPriceOrFail(eventId, priceId);
    const data = toPriceData(dto, existing.status);
    const others = await this.assertPriceRules(eventId, data, priceId);
    this.assertPublishedKeepsNormalPrice(
      event,
      others,
      data.priceType === 'normal' && data.status === 'active',
    );
    return toPriceResponse(await this.repository.updatePrice(priceId, data));
  }

  /**
   * Menghapus harga. Event published tidak boleh kehilangan harga normal aktif terakhirnya.
   *
   * @param eventId - UUID event.
   * @param priceId - UUID harga.
   * @throws AppException 404; 403 EVENT_COMPLETED; 400 MISSING_PRICE.
   */
  async removePrice(eventId: string, priceId: string): Promise<void> {
    const event = await this.events.requireEditableEvent(eventId);
    await this.getPriceOrFail(eventId, priceId);
    const active = await this.repository.listActivePrices(eventId);
    const others = active.filter((price) => price.id !== priceId);
    this.assertPublishedKeepsNormalPrice(event, others, false);
    await this.repository.deletePrice(priceId);
  }

  /**
   * Menambah aturan bundle (jumlah minimum 2 ke atas, persentase maksimal 100, jumlah minimum unik per event).
   *
   * @param eventId - UUID event.
   * @param dto - Data aturan.
   * @returns Aturan yang dibuat.
   * @throws AppException 404; 403 EVENT_COMPLETED; 422 untuk data tidak valid atau jumlah minimum sudah dipakai.
   */
  async createRule(
    eventId: string,
    dto: PricingRuleBodyDto,
  ): Promise<PricingRuleResponse> {
    await this.events.requireEditableEvent(eventId);
    const data = toRuleData(dto, 'active');
    await this.assertRuleRules(eventId, data, null);
    try {
      return toRuleResponse(await this.repository.createRule(eventId, data));
    } catch (error) {
      throw error instanceof PricingRuleQuantityTakenError
        ? this.quantityTaken()
        : error;
    }
  }

  /**
   * Mengganti seluruh data aturan bundle; `status` yang tidak dikirim dipertahankan.
   *
   * @param eventId - UUID event.
   * @param ruleId - UUID aturan.
   * @param dto - Data baru.
   * @returns Aturan setelah diperbarui.
   * @throws AppException 404; 403 EVENT_COMPLETED; 422 untuk data tidak valid.
   */
  async updateRule(
    eventId: string,
    ruleId: string,
    dto: PricingRuleBodyDto,
  ): Promise<PricingRuleResponse> {
    await this.events.requireEditableEvent(eventId);
    const existing = await this.getRuleOrFail(eventId, ruleId);
    const data = toRuleData(dto, existing.status);
    await this.assertRuleRules(eventId, data, ruleId);
    try {
      return toRuleResponse(await this.repository.updateRule(ruleId, data));
    } catch (error) {
      throw error instanceof PricingRuleQuantityTakenError
        ? this.quantityTaken()
        : error;
    }
  }

  /**
   * @param eventId - UUID event.
   * @param ruleId - UUID aturan.
   * @throws AppException 404; 403 EVENT_COMPLETED.
   */
  async removeRule(eventId: string, ruleId: string): Promise<void> {
    await this.events.requireEditableEvent(eventId);
    await this.getRuleOrFail(eventId, ruleId);
    await this.repository.deleteRule(ruleId);
  }

  /**
   * Memeriksa aturan jenis harga dan keunikan terhadap harga aktif lain.
   *
   * @param eventId - UUID event.
   * @param data - Data harga yang akan disimpan.
   * @param selfId - UUID harga yang sedang diubah (dikecualikan dari pemeriksaan), atau null saat membuat.
   * @returns Harga aktif lain pada event (tanpa harga ini).
   */
  private async assertPriceRules(
    eventId: string,
    data: PriceData,
    selfId: string | null,
  ): Promise<EventPrice[]> {
    const errors: Record<string, string[]> = {};
    const start = formatDateOnly(data.startDate);
    const end = formatDateOnly(data.endDate);

    if (data.priceType === 'normal') {
      if (start !== null || end !== null) {
        this.addError(
          errors,
          'start_date',
          'Harga normal tidak memakai rentang tanggal',
        );
      }
    } else {
      if (start === null)
        this.addError(
          errors,
          'start_date',
          'start_date wajib diisi untuk harga early bird',
        );
      if (end === null)
        this.addError(
          errors,
          'end_date',
          'end_date wajib diisi untuk harga early bird',
        );
      if (start !== null && end !== null && end < start) {
        this.addError(
          errors,
          'end_date',
          'end_date tidak boleh sebelum start_date',
        );
      }
    }

    const others = (await this.repository.listActivePrices(eventId)).filter(
      (price) => price.id !== selfId,
    );
    if (data.status === 'active') {
      if (
        data.priceType === 'normal' &&
        others.some((price) => price.priceType === 'normal')
      ) {
        this.addError(
          errors,
          'price_type',
          'Event sudah memiliki harga normal aktif',
        );
      }
      if (data.priceType === 'early_bird' && start !== null && end !== null) {
        const clash = others.some((price) => {
          const otherStart = formatDateOnly(price.startDate);
          const otherEnd = formatDateOnly(price.endDate);
          return (
            price.priceType === 'early_bird' &&
            otherStart !== null &&
            otherEnd !== null &&
            start <= otherEnd &&
            otherStart <= end
          );
        });
        if (clash) {
          this.addError(
            errors,
            'start_date',
            'Periode bertabrakan dengan harga early bird aktif lain',
          );
        }
      }
    }
    this.throwIfInvalid(errors);
    return others;
  }

  private async assertRuleRules(
    eventId: string,
    data: PricingRuleData,
    selfId: string | null,
  ): Promise<void> {
    const errors: Record<string, string[]> = {};
    if (
      data.discountType === 'percentage' &&
      data.discountValue > MAX_PERCENTAGE
    ) {
      this.addError(
        errors,
        'discount_value',
        `Persentase diskon maksimal ${MAX_PERCENTAGE}`,
      );
    }
    const sameQuantity = await this.repository.findRuleByQuantity(
      eventId,
      data.minimumQuantity,
    );
    if (sameQuantity && sameQuantity.id !== selfId) {
      this.addError(
        errors,
        'minimum_quantity',
        'Aturan bundle untuk jumlah minimum ini sudah ada',
      );
    }
    this.throwIfInvalid(errors);
  }

  /**
   * Event published harus selalu punya minimal satu harga normal aktif.
   *
   * @param event - Event.
   * @param otherActivePrices - Harga aktif lain setelah operasi.
   * @param selfIsActiveNormal - True bila harga yang diubah akan menjadi harga normal aktif.
   */
  private assertPublishedKeepsNormalPrice(
    event: Event,
    otherActivePrices: EventPrice[],
    selfIsActiveNormal: boolean,
  ): void {
    if (event.status !== 'published') {
      return;
    }
    if (
      !selfIsActiveNormal &&
      !otherActivePrices.some((price) => price.priceType === 'normal')
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.MISSING_PRICE,
        'Event yang sudah dipublikasikan harus memiliki minimal satu harga normal aktif',
      );
    }
  }

  private async getPriceOrFail(
    eventId: string,
    priceId: string,
  ): Promise<EventPrice> {
    const found = await this.repository.findPrice(eventId, priceId);
    if (!found) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Harga tidak ditemukan',
      );
    }
    return found;
  }

  private async getRuleOrFail(
    eventId: string,
    ruleId: string,
  ): Promise<EventPricingRule> {
    const found = await this.repository.findRule(eventId, ruleId);
    if (!found) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Aturan bundle tidak ditemukan',
      );
    }
    return found;
  }

  private addError(
    errors: Record<string, string[]>,
    field: string,
    message: string,
  ): void {
    (errors[field] ??= []).push(message);
  }

  private throwIfInvalid(errors: Record<string, string[]>): void {
    if (Object.keys(errors).length > 0) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ERROR_CODES.VALIDATION_ERROR,
        'Input tidak valid',
        errors,
      );
    }
  }

  private quantityTaken(): AppException {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ERROR_CODES.VALIDATION_ERROR,
      'Input tidak valid',
      {
        minimum_quantity: ['Aturan bundle untuk jumlah minimum ini sudah ada'],
      },
    );
  }
}

/**
 * @param dto - Body harga.
 * @param defaultStatus - Status bila tidak dikirim.
 * @returns Data repository.
 */
function toPriceData(
  dto: PriceBodyDto,
  defaultStatus: ActiveStatus,
): PriceData {
  return {
    priceType: dto.price_type,
    price: dto.price,
    startDate: dto.start_date ? parseDateOnly(dto.start_date) : null,
    endDate: dto.end_date ? parseDateOnly(dto.end_date) : null,
    status: dto.status ?? defaultStatus,
  };
}

/**
 * @param dto - Body aturan.
 * @param defaultStatus - Status bila tidak dikirim.
 * @returns Data repository.
 */
function toRuleData(
  dto: PricingRuleBodyDto,
  defaultStatus: ActiveStatus,
): PricingRuleData {
  return {
    minimumQuantity: dto.minimum_quantity,
    discountType: dto.discount_type,
    discountValue: dto.discount_value,
    status: dto.status ?? defaultStatus,
  };
}

/**
 * @param row - Baris event_prices.
 * @returns Harga untuk response.
 */
function toPriceResponse(row: EventPrice): PriceResponse {
  return {
    id: row.id,
    price_type: row.priceType,
    price: row.price,
    start_date: formatDateOnly(row.startDate),
    end_date: formatDateOnly(row.endDate),
    status: row.status,
  };
}

/**
 * @param row - Baris event_pricing_rules.
 * @returns Aturan untuk response.
 */
function toRuleResponse(row: EventPricingRule): PricingRuleResponse {
  return {
    id: row.id,
    rule_type: 'bundle',
    minimum_quantity: row.minimumQuantity,
    discount_type: row.discountType,
    discount_value: row.discountValue,
    status: row.status,
  };
}
