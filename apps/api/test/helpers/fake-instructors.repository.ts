import { randomUUID } from 'node:crypto';

import type {
  InstructorData,
  InstructorEventLinks,
  InstructorRow,
} from '../../src/modules/instructors/instructors.repository';
import type { FakeSpecializationsRepository } from './fake-specializations.repository';

interface StoredInstructor extends InstructorData {
  id: string;
  createdAt: Date;
}

/**
 * Repository instruktur in-memory untuk test. Nama specialization diambil dari fake specialization.
 */
export class FakeInstructorsRepository {
  readonly rows = new Map<string, StoredInstructor>();
  /** Jumlah event per instruktur (untuk `event_count`), diatur test. */
  readonly eventCounts = new Map<string, number>();
  /** Keterkaitan event per instruktur untuk aturan hapus, diatur test. */
  readonly eventLinks = new Map<string, InstructorEventLinks>();
  /** Id instruktur yang template-nya dilepas saat dihapus. */
  readonly detachedTemplatesFor: string[] = [];

  /**
   * @param specializations - Fake specialization untuk memetakan id ke nama.
   */
  constructor(
    private readonly specializations: FakeSpecializationsRepository,
  ) {}

  /** Menambah instruktur awal. */
  seed(overrides: Partial<InstructorData> & { name: string }): string {
    const id = randomUUID();
    this.rows.set(id, {
      id,
      createdAt: new Date('2026-10-01T03:00:00Z'),
      profilePicture: null,
      bio: null,
      contactInformation: null,
      status: 'active',
      specializationIds: [],
      ...overrides,
    });
    return id;
  }

  findMany(status?: 'active' | 'inactive'): Promise<InstructorRow[]> {
    const all = [...this.rows.values()]
      .filter((row) => !status || row.status === status)
      .sort((a, b) => a.name.localeCompare(b.name));
    return Promise.resolve(all.map((row) => this.toRow(row)));
  }

  findById(id: string): Promise<InstructorRow | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row ? this.toRow(row) : null);
  }

  create(data: InstructorData): Promise<InstructorRow> {
    const id = this.seed({ ...data });
    return this.findById(id) as Promise<InstructorRow>;
  }

  update(id: string, data: InstructorData): Promise<InstructorRow> {
    const existing = this.rows.get(id);
    this.rows.set(id, {
      ...data,
      id,
      createdAt: existing?.createdAt ?? new Date(),
    });
    return this.findById(id) as Promise<InstructorRow>;
  }

  countEventLinks(id: string): Promise<InstructorEventLinks> {
    return Promise.resolve(
      this.eventLinks.get(id) ?? { activeEvents: 0, totalEvents: 0 },
    );
  }

  deleteDetachingTemplates(id: string): Promise<void> {
    this.detachedTemplatesFor.push(id);
    this.rows.delete(id);
    return Promise.resolve();
  }

  private toRow(row: StoredInstructor): InstructorRow {
    return {
      id: row.id,
      name: row.name,
      profilePicture: row.profilePicture,
      bio: row.bio,
      contactInformation: row.contactInformation,
      status: row.status,
      createdAt: row.createdAt,
      specializations: row.specializationIds
        .map((specId) => ({
          id: specId,
          name: this.specializations.rows.get(specId)?.name ?? '?',
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      eventCount: this.eventCounts.get(row.id) ?? 0,
    };
  }
}
