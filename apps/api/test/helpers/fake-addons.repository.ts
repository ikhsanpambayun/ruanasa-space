import { randomUUID } from 'node:crypto';

import type { Addon } from '@prisma/client';

import {
  AddonInUseError,
  type AddonData,
} from '../../src/modules/addons/addons.repository';

/**
 * Repository add-on in-memory untuk test. Add-on di `usedAddonIds` dianggap sudah dipakai registrasi.
 */
export class FakeAddonsRepository {
  readonly addons = new Map<string, Addon>();
  readonly usedAddonIds = new Set<string>();
  private sequence = 0;

  /** Menambah add-on awal. */
  seed(eventId: string, overrides: Partial<Addon> = {}): Addon {
    this.sequence += 1;
    const addon: Addon = {
      id: randomUUID(),
      eventId,
      name: 'Sewa Yoga Mat',
      description: null,
      price: 25000,
      availableQuantity: 20,
      maxPurchaseQuantity: 2,
      status: 'active',
      createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, this.sequence)),
      ...overrides,
    };
    this.addons.set(addon.id, addon);
    return addon;
  }

  findByEvent(eventId: string): Promise<Addon[]> {
    return Promise.resolve(
      [...this.addons.values()]
        .filter((a) => a.eventId === eventId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    );
  }

  findById(eventId: string, addonId: string): Promise<Addon | null> {
    const addon = this.addons.get(addonId);
    return Promise.resolve(addon && addon.eventId === eventId ? addon : null);
  }

  create(eventId: string, data: AddonData): Promise<Addon> {
    return Promise.resolve(this.seed(eventId, data));
  }

  update(id: string, data: AddonData): Promise<Addon> {
    const updated = { ...(this.addons.get(id) as Addon), ...data };
    this.addons.set(id, updated);
    return Promise.resolve(updated);
  }

  isUsedInRegistrations(id: string): Promise<boolean> {
    return Promise.resolve(this.usedAddonIds.has(id));
  }

  delete(id: string): Promise<void> {
    if (this.usedAddonIds.has(id)) {
      return Promise.reject(new AddonInUseError());
    }
    this.addons.delete(id);
    return Promise.resolve();
  }
}
