import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type ActiveStatus,
  type Addon,
  type Event,
  type EventPrice,
  type EventPricingRule,
  type EventStatus,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

/** Event beserta nama instruktur (untuk daftar admin). */
export type EventWithInstructorName = Event & { instructor: { name: string } };

/** Event lengkap untuk halaman detail admin. */
export type EventDetailRow = Event & {
  instructor: { id: string; name: string; status: ActiveStatus };
  template: { id: string; name: string } | null;
  prices: EventPrice[];
  pricingRules: EventPricingRule[];
  addons: Addon[];
};

/** Ringkasan registrasi suatu event. */
export interface RegistrationSummary {
  /** Jumlah peserta (pax) pada registrasi pending dan confirmed; dasar perhitungan slot. */
  registeredCount: number;
  confirmedRegistrations: number;
  pendingRegistrations: number;
}

/** Data untuk membuat event (draft). */
export interface CreateEventData {
  templateId: string | null;
  instructorId: string;
  eventName: string;
  activityType: string;
  description: string;
  posterUrl: string;
  date: Date | null;
  startTime: Date | null;
  endTime: Date | null;
  location: string;
  capacity: number;
}

/** Data untuk memperbarui event; hanya field yang ada yang diubah. */
export type UpdateEventData = Partial<CreateEventData>;

/** Filter daftar event admin. */
export interface EventListFilter {
  status?: EventStatus;
  search?: string;
  skip: number;
  take: number;
}

const COUNTED_REGISTRATION_STATUSES = ['pending', 'confirmed'] as const;

/**
 * Akses data tabel events dan data terkait. Semua query membaca hanya event yang belum di-soft-delete.
 */
@Injectable()
export class EventsRepository {
  /**
   * @param prisma - Prisma client.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Daftar event admin, terbaru dibuat lebih dulu.
   *
   * @param filter - Status, kata kunci (nama event, jenis aktivitas, nama instruktur), dan window pagination.
   * @returns Baris pada halaman ini dan total seluruh baris yang cocok.
   */
  async findMany(
    filter: EventListFilter,
  ): Promise<{ rows: EventWithInstructorName[]; total: number }> {
    const where: Prisma.EventWhereInput = {
      deletedAt: null,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.search
        ? {
            OR: [
              { eventName: { contains: filter.search, mode: 'insensitive' } },
              {
                activityType: { contains: filter.search, mode: 'insensitive' },
              },
              {
                instructor: {
                  name: { contains: filter.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: { instructor: { select: { name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.event.count({ where }),
    ]);
    return { rows, total };
  }

  /**
   * Jumlah peserta terdaftar (registrasi pending + confirmed) untuk banyak event sekaligus.
   *
   * @param eventIds - Daftar UUID event.
   * @returns Map eventId ke jumlah peserta; event tanpa registrasi bernilai 0.
   */
  async countRegisteredByEvent(
    eventIds: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>(eventIds.map((id) => [id, 0]));
    if (eventIds.length === 0) {
      return result;
    }
    const groups = await this.prisma.registration.groupBy({
      by: ['eventId'],
      where: {
        eventId: { in: eventIds },
        registrationStatus: { in: [...COUNTED_REGISTRATION_STATUSES] },
        deletedAt: null,
      },
      _sum: { totalPax: true },
    });
    for (const group of groups) {
      result.set(group.eventId, group._sum.totalPax ?? 0);
    }
    return result;
  }

  /**
   * @param id - UUID event.
   * @returns Event atau null bila tidak ada / sudah di-soft-delete.
   */
  findById(id: string): Promise<Event | null> {
    return this.prisma.event.findFirst({ where: { id, deletedAt: null } });
  }

  /**
   * @param id - UUID event.
   * @returns Event lengkap dengan instruktur, template, harga, aturan bundle, dan add-on; atau null.
   */
  findDetailById(id: string): Promise<EventDetailRow | null> {
    return this.prisma.event.findFirst({
      where: { id, deletedAt: null },
      include: {
        instructor: { select: { id: true, name: true, status: true } },
        template: { select: { id: true, name: true } },
        prices: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        pricingRules: { orderBy: [{ minimumQuantity: 'asc' }, { id: 'asc' }] },
        addons: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
  }

  /**
   * @param eventId - UUID event.
   * @returns Ringkasan registrasi event.
   */
  async getRegistrationSummary(eventId: string): Promise<RegistrationSummary> {
    const [registered, byStatus] = await Promise.all([
      this.countRegisteredByEvent([eventId]),
      this.prisma.registration.groupBy({
        by: ['registrationStatus'],
        where: { eventId, deletedAt: null },
        _count: { _all: true },
      }),
    ]);
    const count = (status: string): number =>
      byStatus.find((g) => g.registrationStatus === status)?._count._all ?? 0;
    return {
      registeredCount: registered.get(eventId) ?? 0,
      confirmedRegistrations: count('confirmed'),
      pendingRegistrations: count('pending'),
    };
  }

  /**
   * @param data - Data event baru (status draft).
   * @returns Event yang dibuat.
   */
  create(data: CreateEventData): Promise<Event> {
    return this.prisma.event.create({ data: { ...data, status: 'draft' } });
  }

  /**
   * @param id - UUID event.
   * @param data - Field yang diubah.
   * @returns Event setelah diperbarui.
   */
  update(id: string, data: UpdateEventData): Promise<Event> {
    return this.prisma.event.update({ where: { id }, data });
  }

  /**
   * Soft delete event draft secara atomik: hanya berhasil bila event masih draft pada saat update.
   *
   * @param id - UUID event.
   * @returns True bila event dihapus.
   */
  async softDeleteDraft(id: string): Promise<boolean> {
    const result = await this.prisma.event.updateMany({
      where: { id, status: 'draft', deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  }

  /**
   * Mengubah status secara atomik: hanya berhasil bila status saat ini sama dengan `from`.
   * Mencegah dua admin menjalankan transisi yang sama secara bersamaan.
   *
   * @param id - UUID event.
   * @param from - Status yang diharapkan.
   * @param to - Status baru.
   * @returns True bila transisi terjadi.
   */
  async transitionStatus(
    id: string,
    from: EventStatus,
    to: EventStatus,
  ): Promise<boolean> {
    const result = await this.prisma.event.updateMany({
      where: { id, status: from, deletedAt: null },
      data: {
        status: to,
        ...(to === 'completed' ? { completedAt: new Date() } : {}),
      },
    });
    return result.count > 0;
  }

  /**
   * @param eventId - UUID event.
   * @returns True bila event punya minimal satu harga normal berstatus active.
   */
  async hasActiveNormalPrice(eventId: string): Promise<boolean> {
    const count = await this.prisma.eventPrice.count({
      where: { eventId, priceType: 'normal', status: 'active' },
    });
    return count > 0;
  }

  /**
   * @param templateId - UUID template.
   * @returns True bila template ada.
   */
  async templateExists(templateId: string): Promise<boolean> {
    return (
      (await this.prisma.eventTemplate.count({ where: { id: templateId } })) > 0
    );
  }

  /**
   * Menduplikasi event ke draft baru dalam satu transaksi: semua data event beserta harga, aturan bundle,
   * dan add-on disalin; tanggal dan jam dikosongkan; registrasi, peserta, pembayaran, dan kehadiran tidak disalin.
   *
   * @param sourceId - UUID event sumber.
   * @returns Event baru, atau null bila sumber tidak ada.
   */
  async duplicate(sourceId: string): Promise<Event | null> {
    const source = await this.prisma.event.findFirst({
      where: { id: sourceId, deletedAt: null },
      include: { prices: true, pricingRules: true, addons: true },
    });
    if (!source) {
      return null;
    }
    return this.prisma.event.create({
      data: {
        templateId: source.templateId,
        instructorId: source.instructorId,
        eventName: source.eventName,
        activityType: source.activityType,
        description: source.description,
        posterUrl: source.posterUrl,
        location: source.location,
        capacity: source.capacity,
        status: 'draft',
        date: null,
        startTime: null,
        endTime: null,
        prices: {
          create: source.prices.map((p) => ({
            priceType: p.priceType,
            price: p.price,
            startDate: p.startDate,
            endDate: p.endDate,
            status: p.status,
          })),
        },
        pricingRules: {
          create: source.pricingRules.map((r) => ({
            ruleType: r.ruleType,
            minimumQuantity: r.minimumQuantity,
            discountType: r.discountType,
            discountValue: r.discountValue,
            status: r.status,
          })),
        },
        addons: {
          create: source.addons.map((a) => ({
            name: a.name,
            description: a.description,
            price: a.price,
            availableQuantity: a.availableQuantity,
            maxPurchaseQuantity: a.maxPurchaseQuantity,
            status: a.status,
          })),
        },
      },
    });
  }
}
