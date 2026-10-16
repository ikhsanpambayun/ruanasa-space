import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

/**
 * Template event beserta nama instruktur (bila ada).
 */
export interface TemplateRow {
  id: string;
  name: string;
  activityType: string;
  description: string | null;
  instructorId: string | null;
  instructorName: string | null;
  createdAt: Date;
}

/**
 * Data untuk membuat/memperbarui template. Template TIDAK menyimpan harga maupun add-on (ERD Section 8).
 */
export interface TemplateData {
  name: string;
  activityType: string;
  description: string | null;
  instructorId: string | null;
}

const include = {
  instructor: { select: { name: true } },
} satisfies Prisma.EventTemplateInclude;

type TemplateWithInstructor = Prisma.EventTemplateGetPayload<{
  include: typeof include;
}>;

/**
 * Memetakan hasil Prisma ke TemplateRow.
 *
 * @param row - Template dengan nama instruktur.
 * @returns Baris template.
 */
function toRow(row: TemplateWithInstructor): TemplateRow {
  return {
    id: row.id,
    name: row.name,
    activityType: row.activityType,
    description: row.description,
    instructorId: row.instructorId,
    instructorName: row.instructor?.name ?? null,
    createdAt: row.createdAt,
  };
}

/**
 * Akses data tabel event_templates.
 */
@Injectable()
export class TemplatesRepository {
  /**
   * @param prisma - Prisma client.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @returns Semua template, terbaru lebih dulu.
   */
  async findAll(): Promise<TemplateRow[]> {
    const rows = await this.prisma.eventTemplate.findMany({
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toRow);
  }

  /**
   * @param id - UUID template.
   * @returns Template atau null.
   */
  async findById(id: string): Promise<TemplateRow | null> {
    const row = await this.prisma.eventTemplate.findUnique({
      where: { id },
      include,
    });
    return row ? toRow(row) : null;
  }

  /**
   * @param data - Data template.
   * @returns Template yang dibuat.
   */
  async create(data: TemplateData): Promise<TemplateRow> {
    return toRow(await this.prisma.eventTemplate.create({ data, include }));
  }

  /**
   * @param id - UUID template.
   * @param data - Data baru (mengganti seluruh data).
   * @returns Template setelah diperbarui.
   */
  async update(id: string, data: TemplateData): Promise<TemplateRow> {
    return toRow(
      await this.prisma.eventTemplate.update({ where: { id }, data, include }),
    );
  }

  /**
   * Menghapus template. Event yang dibuat dari template ini tetap ada; `template_id` mereka menjadi NULL
   * (ON DELETE SET NULL).
   *
   * @param id - UUID template.
   */
  async delete(id: string): Promise<void> {
    await this.prisma.eventTemplate.delete({ where: { id } });
  }
}
