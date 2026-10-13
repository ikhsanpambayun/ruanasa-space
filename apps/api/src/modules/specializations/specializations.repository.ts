import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

/**
 * Specialization beserta jumlah instruktur yang memakainya.
 */
export interface SpecializationRow {
  id: string;
  name: string;
  instructorCount: number;
}

/**
 * Dilempar saat nama specialization melanggar unique constraint.
 */
export class SpecializationNameTakenError extends Error {
  constructor() {
    super('Specialization name already exists');
    this.name = 'SpecializationNameTakenError';
  }
}

const withCount = {
  _count: { select: { instructors: true } },
} satisfies Prisma.SpecializationInclude;

/**
 * Akses data tabel specializations.
 */
@Injectable()
export class SpecializationsRepository {
  /**
   * @param prisma - Prisma client.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Semua specialization, urut nama, dengan jumlah instruktur.
   *
   * @returns Daftar specialization.
   */
  async findAll(): Promise<SpecializationRow[]> {
    const rows = await this.prisma.specialization.findMany({
      include: withCount,
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      instructorCount: row._count.instructors,
    }));
  }

  /**
   * @param id - UUID specialization.
   * @returns Specialization atau null.
   */
  async findById(id: string): Promise<SpecializationRow | null> {
    const row = await this.prisma.specialization.findUnique({
      where: { id },
      include: withCount,
    });
    return row
      ? { id: row.id, name: row.name, instructorCount: row._count.instructors }
      : null;
  }

  /**
   * Mencari berdasarkan nama tanpa membedakan huruf besar/kecil.
   *
   * @param name - Nama specialization.
   * @returns Specialization atau null.
   */
  async findByName(name: string): Promise<SpecializationRow | null> {
    const row = await this.prisma.specialization.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      include: withCount,
    });
    return row
      ? { id: row.id, name: row.name, instructorCount: row._count.instructors }
      : null;
  }

  /**
   * Mengembalikan id yang benar-benar ada dari daftar id yang diberikan.
   *
   * @param ids - Daftar UUID.
   * @returns Subset id yang ditemukan.
   */
  async findExistingIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.specialization.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /**
   * @param name - Nama baru.
   * @returns Specialization yang dibuat.
   * @throws SpecializationNameTakenError bila nama sudah ada.
   */
  async create(name: string): Promise<SpecializationRow> {
    try {
      const row = await this.prisma.specialization.create({
        data: { name },
        include: withCount,
      });
      return {
        id: row.id,
        name: row.name,
        instructorCount: row._count.instructors,
      };
    } catch (error) {
      throw this.translate(error);
    }
  }

  /**
   * @param id - UUID specialization.
   * @param name - Nama baru.
   * @returns Specialization setelah diperbarui.
   * @throws SpecializationNameTakenError bila nama sudah dipakai specialization lain.
   */
  async update(id: string, name: string): Promise<SpecializationRow> {
    try {
      const row = await this.prisma.specialization.update({
        where: { id },
        data: { name },
        include: withCount,
      });
      return {
        id: row.id,
        name: row.name,
        instructorCount: row._count.instructors,
      };
    } catch (error) {
      throw this.translate(error);
    }
  }

  /**
   * Menghapus specialization. Mapping ke instruktur ikut terhapus (ON DELETE CASCADE di ERD).
   *
   * @param id - UUID specialization.
   */
  async delete(id: string): Promise<void> {
    await this.prisma.specialization.delete({ where: { id } });
  }

  private translate(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new SpecializationNameTakenError();
    }
    return error;
  }
}
