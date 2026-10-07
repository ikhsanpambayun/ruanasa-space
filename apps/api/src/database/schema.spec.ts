import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Prisma } from '@prisma/client';

const MIGRATIONS_DIR = join(__dirname, 'prisma', 'migrations');

/**
 * Daftar kolom per tabel (nama DB) dari DMMF Prisma.
 *
 * @returns Map nama tabel ke daftar nama kolom.
 */
function columnsByTable(): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const columns = model.fields
      .filter((field) => field.kind !== 'object')
      .map((field) => field.dbName ?? field.name);
    result.set(model.dbName ?? model.name, columns);
  }
  return result;
}

/**
 * Menggabungkan seluruh migration.sql menjadi satu string.
 *
 * @returns Isi semua migrasi, berurutan.
 */
function allMigrationSql(): string {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) =>
      readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'),
    )
    .join('\n');
}

describe('Prisma schema vs ERD v1.6', () => {
  const tables = columnsByTable();

  it('defines exactly the 17 ERD tables', () => {
    expect([...tables.keys()].sort()).toEqual(
      [
        'addons',
        'attendance',
        'discount_codes',
        'event_pricing_rules',
        'event_prices',
        'event_templates',
        'events',
        'feedback',
        'instructor_specialization_mapping',
        'instructors',
        'notifications',
        'participants',
        'payments',
        'registration_addons',
        'registrations',
        'specializations',
        'users',
      ].sort(),
    );
  });

  it('puts updated_at only on mutable tables (ERD Section 1)', () => {
    const withUpdatedAt = [...tables.entries()]
      .filter(([, columns]) => columns.includes('updated_at'))
      .map(([table]) => table)
      .sort();

    expect(withUpdatedAt).toEqual(
      [
        'users',
        'events',
        'instructors',
        'event_templates',
        'registrations',
        'payments',
        'discount_codes',
      ].sort(),
    );
  });

  it('puts deleted_at only on users, events, and registrations (ERD Section 21.6)', () => {
    const withDeletedAt = [...tables.entries()]
      .filter(([, columns]) => columns.includes('deleted_at'))
      .map(([table]) => table)
      .sort();

    expect(withDeletedAt).toEqual(['events', 'registrations', 'users']);
  });

  it('has created_at on every table except the mapping, registration_addons, and attendance tables', () => {
    const without = [...tables.entries()]
      .filter(([, columns]) => !columns.includes('created_at'))
      .map(([table]) => table)
      .sort();

    // ERD tidak mendefinisikan created_at pada tiga tabel ini.
    expect(without).toEqual([
      'attendance',
      'instructor_specialization_mapping',
      'registration_addons',
    ]);
  });

  it('makes events.date, start_time, and end_time nullable (decision K1)', () => {
    const events = Prisma.dmmf.datamodel.models.find(
      (model) => model.name === 'Event',
    );
    const required = (name: string): boolean | undefined =>
      events?.fields.find((field) => field.name === name)?.isRequired;

    expect(required('date')).toBe(false);
    expect(required('startTime')).toBe(false);
    expect(required('endTime')).toBe(false);
    expect(required('eventName')).toBe(true);
  });

  it('keeps feedback rating nullable and submitted_at nullable', () => {
    const feedback = Prisma.dmmf.datamodel.models.find(
      (model) => model.name === 'Feedback',
    );
    const required = (name: string): boolean | undefined =>
      feedback?.fields.find((field) => field.name === name)?.isRequired;

    expect(required('rating')).toBe(false);
    expect(required('submittedAt')).toBe(false);
    expect(required('token')).toBe(true);
  });
});

describe('Migration SQL', () => {
  const sql = allMigrationSql();

  it('creates the partial unique index that lets expired registrations be re-registered', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "idx_registrations_event_buyer_active"\s+ON "registrations" \("event_id", "buyer_user_id"\)\s+WHERE "deleted_at" IS NULL AND "registration_status" <> 'expired'/,
    );
  });

  it('does not create a plain unique index on registrations (event_id, buyer_user_id)', () => {
    const plainUnique =
      /CREATE UNIQUE INDEX "[^"]+" ON "registrations"\("event_id", "buyer_user_id"\)/;

    expect(sql).not.toMatch(plainUnique);
  });

  it('uses gen_random_uuid() as the primary key default', () => {
    expect(sql).toContain('"id" UUID NOT NULL DEFAULT gen_random_uuid()');
  });

  it('keeps every identifier within the PostgreSQL 63-character limit', () => {
    const identifiers = [...sql.matchAll(/"([a-z0-9_]{40,})"/g)].map(
      (match) => match[1] ?? '',
    );

    expect(identifiers.filter((name) => name.length > 63)).toEqual([]);
  });

  it.each([
    'chk_events_capacity_min',
    'chk_registrations_total_pax_min',
    'chk_event_pricing_rules_percentage_max',
    'chk_discount_codes_used_count_range',
    'chk_feedback_rating_range',
    'chk_event_prices_early_bird_period',
  ])('defines CHECK constraint %s', (name) => {
    expect(sql).toContain(`"${name}"`);
  });
});
