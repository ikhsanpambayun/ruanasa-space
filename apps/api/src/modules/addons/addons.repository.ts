import { Injectable } from '@nestjs/common';
import { Prisma, type ActiveStatus, type Addon } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

/** Data add-on. */
export interface AddonData {
  name: string;
  description: string | null;
  price: number;
  availableQuantity: number;
  maxPurchaseQuantity: number;
  status: ActiveStatus;
}

/**
 * Dilempar saat add-on masih dipakai registrasi (foreign key registration_addons.addon_id) saat dihapus.
 */
export class AddonInUseError extends Error {
  constructor() {
    super('Add-on is referenced by registrations');
    this.name = 'AddonInUseError';
  }
}

/**
 * Akses data tabel addons.
 */
@Injectable()
export class AddonsRepository {
  /**
   * @param prisma - Prisma client.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param eventId - UUID event.
   * @returns Semua add-on event (semua status), urut pembuatan.
   */
  findByEvent(eventId: string): Promise<Addon[]> {
    return this.prisma.addon.findMany({
      where: { eventId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * @param eventId - UUID event.
   * @param addonId - UUID add-on.
   * @returns Add-on milik event tersebut, atau null.
   */
  findById(eventId: string, addonId: string): Promise<Addon | null> {
    return this.prisma.addon.findFirst({ where: { id: addonId, eventId } });
  }

  /**
   * @param eventId - UUID event.
   * @param data - Data add-on.
   * @returns Add-on yang dibuat.
   */
  create(eventId: string, data: AddonData): Promise<Addon> {
    return this.prisma.addon.create({ data: { eventId, ...data } });
  }

  /**
   * @param id - UUID add-on.
   * @param data - Data baru.
   * @returns Add-on setelah diperbarui.
   */
  update(id: string, data: AddonData): Promise<Addon> {
    return this.prisma.addon.update({ where: { id }, data });
  }

  /**
   * @param id - UUID add-on.
   * @returns True bila add-on sudah dipakai oleh minimal satu registrasi.
   */
  async isUsedInRegistrations(id: string): Promise<boolean> {
    return (
      (await this.prisma.registrationAddon.count({ where: { addonId: id } })) >
      0
    );
  }

  /**
   * @param id - UUID add-on.
   * @throws AddonInUseError bila ternyata dipakai registrasi (balapan dengan registrasi baru).
   */
  async delete(id: string): Promise<void> {
    try {
      await this.prisma.addon.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new AddonInUseError();
      }
      throw error;
    }
  }
}
