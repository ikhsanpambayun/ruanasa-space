import { randomUUID } from 'node:crypto';

import type {
  Addon,
  Event,
  EventPrice,
  EventPricingRule,
  EventStatus,
} from '@prisma/client';

import type {
  CreateEventData,
  EventDetailRow,
  EventListFilter,
  EventWithInstructorName,
  RegistrationSummary,
  UpdateEventData,
} from '../../src/modules/events/events.repository';
import type { FakeInstructorsRepository } from './fake-instructors.repository';

/** Data harga, aturan bundle, dan add-on suatu event pada fake. */
export interface FakeEventRelations {
  prices: EventPrice[];
  pricingRules: EventPricingRule[];
  addons: Addon[];
}

/**
 * Repository event in-memory untuk test. Meniru soft delete, transisi status bersyarat (atomik),
 * dan perhitungan slot dari data yang diatur test.
 */
export class FakeEventsRepository {
  readonly events = new Map<string, Event>();
  readonly relations = new Map<string, FakeEventRelations>();
  /** Jumlah peserta terdaftar (pending + confirmed) per event. */
  readonly registered = new Map<string, number>();
  readonly confirmed = new Map<string, number>();
  readonly pending = new Map<string, number>();
  readonly templates = new Set<string>();
  /** Dipanggil tepat sebelum transisi status bersyarat; dipakai untuk mensimulasikan balapan. */
  onBeforeTransition: ((id: string) => void) | null = null;
  private sequence = 0;

  /**
   * @param instructors - Fake instruktur untuk nama instruktur pada daftar.
   */
  constructor(private readonly instructors: FakeInstructorsRepository) {}

  /** Menambah event awal. */
  seed(overrides: Partial<Event> & { instructorId: string }): Event {
    this.sequence += 1;
    const stamp = new Date(Date.UTC(2026, 9, 1, 0, 0, this.sequence));
    const event: Event = {
      id: randomUUID(),
      templateId: null,
      eventName: 'Vinyasa Flow',
      activityType: 'yoga',
      description: 'Kelas vinyasa untuk semua level',
      posterUrl: 'https://cdn.example.com/poster.jpg',
      date: new Date('2099-01-15T00:00:00Z'),
      startTime: new Date('1970-01-01T08:00:00Z'),
      endTime: new Date('1970-01-01T09:30:00Z'),
      location: 'Ruanasa Studio',
      capacity: 20,
      status: 'draft',
      completedAt: null,
      postEventSent: false,
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
      ...overrides,
    };
    this.events.set(event.id, event);
    this.relations.set(event.id, { prices: [], pricingRules: [], addons: [] });
    return event;
  }

  /** Menambah harga normal aktif pada event. */
  addNormalPrice(eventId: string, price = 150000): void {
    this.relations.get(eventId)?.prices.push({
      id: randomUUID(),
      eventId,
      priceType: 'normal',
      price,
      startDate: null,
      endDate: null,
      status: 'active',
      createdAt: new Date(),
    });
  }

  findMany(
    filter: EventListFilter,
  ): Promise<{ rows: EventWithInstructorName[]; total: number }> {
    const search = filter.search?.toLowerCase();
    const matching = [...this.events.values()]
      .filter((event) => event.deletedAt === null)
      .filter((event) => !filter.status || event.status === filter.status)
      .map((event) => ({
        ...event,
        instructor: { name: this.instructorName(event.instructorId) },
      }))
      .filter(
        (event) =>
          !search ||
          event.eventName.toLowerCase().includes(search) ||
          event.activityType.toLowerCase().includes(search) ||
          event.instructor.name.toLowerCase().includes(search),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve({
      rows: matching.slice(filter.skip, filter.skip + filter.take),
      total: matching.length,
    });
  }

  countRegisteredByEvent(eventIds: string[]): Promise<Map<string, number>> {
    return Promise.resolve(
      new Map(eventIds.map((id) => [id, this.registered.get(id) ?? 0])),
    );
  }

  findById(id: string): Promise<Event | null> {
    const event = this.events.get(id);
    return Promise.resolve(event && event.deletedAt === null ? event : null);
  }

  findDetailById(id: string): Promise<EventDetailRow | null> {
    const event = this.events.get(id);
    if (!event || event.deletedAt !== null) {
      return Promise.resolve(null);
    }
    const relations = this.relations.get(id) ?? {
      prices: [],
      pricingRules: [],
      addons: [],
    };
    return Promise.resolve({
      ...event,
      instructor: {
        id: event.instructorId,
        name: this.instructorName(event.instructorId),
        status: 'active',
      },
      template: event.templateId
        ? { id: event.templateId, name: 'Template' }
        : null,
      ...relations,
    });
  }

  getRegistrationSummary(eventId: string): Promise<RegistrationSummary> {
    return Promise.resolve({
      registeredCount: this.registered.get(eventId) ?? 0,
      confirmedRegistrations: this.confirmed.get(eventId) ?? 0,
      pendingRegistrations: this.pending.get(eventId) ?? 0,
    });
  }

  create(data: CreateEventData): Promise<Event> {
    return Promise.resolve(this.seed({ ...data, status: 'draft' }));
  }

  update(id: string, data: UpdateEventData): Promise<Event> {
    const event = this.events.get(id) as Event;
    const updated = { ...event, ...data, updatedAt: new Date() };
    this.events.set(id, updated);
    return Promise.resolve(updated);
  }

  softDeleteDraft(id: string): Promise<boolean> {
    const event = this.events.get(id);
    if (!event || event.status !== 'draft' || event.deletedAt !== null) {
      return Promise.resolve(false);
    }
    this.events.set(id, { ...event, deletedAt: new Date() });
    return Promise.resolve(true);
  }

  transitionStatus(
    id: string,
    from: EventStatus,
    to: EventStatus,
  ): Promise<boolean> {
    this.onBeforeTransition?.(id);
    const event = this.events.get(id);
    if (!event || event.status !== from || event.deletedAt !== null) {
      return Promise.resolve(false);
    }
    this.events.set(id, {
      ...event,
      status: to,
      ...(to === 'completed' ? { completedAt: new Date() } : {}),
    });
    return Promise.resolve(true);
  }

  hasActiveNormalPrice(eventId: string): Promise<boolean> {
    const prices = this.relations.get(eventId)?.prices ?? [];
    return Promise.resolve(
      prices.some((p) => p.priceType === 'normal' && p.status === 'active'),
    );
  }

  templateExists(templateId: string): Promise<boolean> {
    return Promise.resolve(this.templates.has(templateId));
  }

  duplicate(sourceId: string): Promise<Event | null> {
    const source = this.events.get(sourceId);
    if (!source || source.deletedAt !== null) {
      return Promise.resolve(null);
    }
    const copy = this.seed({
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
    });
    const sourceRelations = this.relations.get(sourceId) ?? {
      prices: [],
      pricingRules: [],
      addons: [],
    };
    this.relations.set(copy.id, {
      prices: sourceRelations.prices.map((p) => ({
        ...p,
        id: randomUUID(),
        eventId: copy.id,
      })),
      pricingRules: sourceRelations.pricingRules.map((r) => ({
        ...r,
        id: randomUUID(),
        eventId: copy.id,
      })),
      addons: sourceRelations.addons.map((a) => ({
        ...a,
        id: randomUUID(),
        eventId: copy.id,
      })),
    });
    return Promise.resolve(copy);
  }

  private instructorName(instructorId: string): string {
    return this.instructors.rows.get(instructorId)?.name ?? '?';
  }
}
