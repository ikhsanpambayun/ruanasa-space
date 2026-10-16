import { HttpStatus, Injectable } from '@nestjs/common';
import type { ActiveStatus, Addon } from '@prisma/client';

import { ERROR_CODES } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { EventsService } from '../events/events.service';
import {
  AddonInUseError,
  AddonsRepository,
  type AddonData,
} from './addons.repository';
import type { AddonBodyDto } from './dto/addon.dto';

/** Add-on pada response (API Spec v1.6 Section 11.1). */
export interface AddonResponse {
  id: string;
  name: string;
  description: string | null;
  price: number;
  available_quantity: number;
  max_purchase_quantity: number;
  status: ActiveStatus;
}

const IN_USE_MESSAGE =
  'Add-on sudah dipakai dalam registrasi dan tidak dapat dihapus. Nonaktifkan add-on jika tidak ingin ditampilkan lagi';

/**
 * Logika bisnis add-on per event.
 */
@Injectable()
export class AddonsService {
  /**
   * @param repository - Repository add-on.
   * @param events - Service event (validasi keberadaan dan status event).
   */
  constructor(
    private readonly repository: AddonsRepository,
    private readonly events: EventsService,
  ) {}

  /**
   * @param eventId - UUID event.
   * @returns Semua add-on event, termasuk yang nonaktif.
   * @throws AppException 404 EVENT_NOT_FOUND.
   */
  async list(eventId: string): Promise<AddonResponse[]> {
    await this.events.requireEvent(eventId);
    return (await this.repository.findByEvent(eventId)).map(toResponse);
  }

  /**
   * @param eventId - UUID event.
   * @param dto - Data add-on.
   * @returns Add-on yang dibuat (status active bila tidak dikirim).
   * @throws AppException 404; 403 EVENT_COMPLETED.
   */
  async create(eventId: string, dto: AddonBodyDto): Promise<AddonResponse> {
    await this.events.requireEditableEvent(eventId);
    return toResponse(
      await this.repository.create(eventId, toData(dto, 'active')),
    );
  }

  /**
   * Mengganti seluruh data add-on, termasuk stok `available_quantity` (stok tersisa; berkurang otomatis oleh registrasi).
   *
   * @param eventId - UUID event.
   * @param addonId - UUID add-on.
   * @param dto - Data baru.
   * @returns Add-on setelah diperbarui.
   * @throws AppException 404; 403 EVENT_COMPLETED.
   */
  async update(
    eventId: string,
    addonId: string,
    dto: AddonBodyDto,
  ): Promise<AddonResponse> {
    await this.events.requireEditableEvent(eventId);
    const existing = await this.getOrFail(eventId, addonId);
    return toResponse(
      await this.repository.update(addonId, toData(dto, existing.status)),
    );
  }

  /**
   * Menghapus add-on yang belum pernah dipakai registrasi. Yang sudah dipakai harus dinonaktifkan
   * agar riwayat registrasi tetap utuh.
   *
   * @param eventId - UUID event.
   * @param addonId - UUID add-on.
   * @throws AppException 404; 403 EVENT_COMPLETED; 422 bila add-on sudah dipakai registrasi.
   */
  async remove(eventId: string, addonId: string): Promise<void> {
    await this.events.requireEditableEvent(eventId);
    await this.getOrFail(eventId, addonId);
    if (await this.repository.isUsedInRegistrations(addonId)) {
      throw this.inUse();
    }
    try {
      await this.repository.delete(addonId);
    } catch (error) {
      throw error instanceof AddonInUseError ? this.inUse() : error;
    }
  }

  private async getOrFail(eventId: string, addonId: string): Promise<Addon> {
    const found = await this.repository.findById(eventId, addonId);
    if (!found) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Add-on tidak ditemukan',
      );
    }
    return found;
  }

  private inUse(): AppException {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ERROR_CODES.VALIDATION_ERROR,
      IN_USE_MESSAGE,
    );
  }
}

/**
 * @param dto - Body request.
 * @param defaultStatus - Status bila tidak dikirim.
 * @returns Data repository.
 */
function toData(dto: AddonBodyDto, defaultStatus: ActiveStatus): AddonData {
  return {
    name: dto.name,
    description: dto.description ?? null,
    price: dto.price,
    availableQuantity: dto.available_quantity,
    maxPurchaseQuantity: dto.max_purchase_quantity,
    status: dto.status ?? defaultStatus,
  };
}

/**
 * @param row - Baris addons.
 * @returns Add-on untuk response.
 */
function toResponse(row: Addon): AddonResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    available_quantity: row.availableQuantity,
    max_purchase_quantity: row.maxPurchaseQuantity,
    status: row.status,
  };
}
