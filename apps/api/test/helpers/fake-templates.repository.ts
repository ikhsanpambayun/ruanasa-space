import { randomUUID } from 'node:crypto';

import type {
  TemplateData,
  TemplateRow,
} from '../../src/modules/templates/templates.repository';
import type { FakeInstructorsRepository } from './fake-instructors.repository';

/**
 * Repository template in-memory untuk test. Nama instruktur diambil dari fake instruktur.
 */
export class FakeTemplatesRepository {
  readonly rows = new Map<string, TemplateRow>();
  private sequence = 0;

  /**
   * @param instructors - Fake instruktur untuk memetakan id ke nama.
   */
  constructor(private readonly instructors: FakeInstructorsRepository) {}

  /** Menambah template awal. */
  seed(overrides: Partial<TemplateData> & { name: string }): TemplateRow {
    this.sequence += 1;
    const data: TemplateData = {
      activityType: 'yoga',
      description: null,
      instructorId: null,
      ...overrides,
    };
    const row: TemplateRow = {
      id: randomUUID(),
      ...data,
      instructorName: this.nameOf(data.instructorId),
      createdAt: new Date(Date.UTC(2026, 9, 1, 3, 0, this.sequence)),
    };
    this.rows.set(row.id, row);
    return row;
  }

  findAll(): Promise<TemplateRow[]> {
    return Promise.resolve(
      [...this.rows.values()].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      ),
    );
  }

  findById(id: string): Promise<TemplateRow | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  create(data: TemplateData): Promise<TemplateRow> {
    return Promise.resolve(this.seed({ ...data }));
  }

  update(id: string, data: TemplateData): Promise<TemplateRow> {
    const existing = this.rows.get(id) as TemplateRow;
    const row: TemplateRow = {
      ...existing,
      ...data,
      instructorName: this.nameOf(data.instructorId),
    };
    this.rows.set(id, row);
    return Promise.resolve(row);
  }

  delete(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  private nameOf(instructorId: string | null): string | null {
    return instructorId
      ? (this.instructors.rows.get(instructorId)?.name ?? null)
      : null;
  }
}
