import { randomUUID } from 'node:crypto';

import {
  SpecializationNameTakenError,
  type SpecializationRow,
} from '../../src/modules/specializations/specializations.repository';

/**
 * Repository specialization in-memory untuk test. Meniru unique nama (case-sensitive seperti ERD);
 * pengecekan case-insensitive dilakukan service lewat findByName.
 */
export class FakeSpecializationsRepository {
  readonly rows = new Map<string, { id: string; name: string }>();
  /** Jumlah instruktur per specialization yang diatur test. */
  readonly instructorCounts = new Map<string, number>();

  /** Menambah data awal. */
  seed(name: string, instructorCount = 0): string {
    const id = randomUUID();
    this.rows.set(id, { id, name });
    this.instructorCounts.set(id, instructorCount);
    return id;
  }

  findAll(): Promise<SpecializationRow[]> {
    const all = [...this.rows.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return Promise.resolve(all.map((row) => this.toRow(row)));
  }

  findById(id: string): Promise<SpecializationRow | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row ? this.toRow(row) : null);
  }

  findByName(name: string): Promise<SpecializationRow | null> {
    const found = [...this.rows.values()].find(
      (row) => row.name.toLowerCase() === name.toLowerCase(),
    );
    return Promise.resolve(found ? this.toRow(found) : null);
  }

  findExistingIds(ids: string[]): Promise<string[]> {
    return Promise.resolve(ids.filter((id) => this.rows.has(id)));
  }

  create(name: string): Promise<SpecializationRow> {
    if ([...this.rows.values()].some((row) => row.name === name)) {
      return Promise.reject(new SpecializationNameTakenError());
    }
    const id = this.seed(name);
    return this.findById(id) as Promise<SpecializationRow>;
  }

  update(id: string, name: string): Promise<SpecializationRow> {
    if (
      [...this.rows.values()].some((row) => row.name === name && row.id !== id)
    ) {
      return Promise.reject(new SpecializationNameTakenError());
    }
    this.rows.set(id, { id, name });
    return this.findById(id) as Promise<SpecializationRow>;
  }

  delete(id: string): Promise<void> {
    this.rows.delete(id);
    this.instructorCounts.delete(id);
    return Promise.resolve();
  }

  private toRow(row: { id: string; name: string }): SpecializationRow {
    return {
      id: row.id,
      name: row.name,
      instructorCount: this.instructorCounts.get(row.id) ?? 0,
    };
  }
}
