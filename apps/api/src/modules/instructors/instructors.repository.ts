import { Injectable } from '@nestjs/common';
import { Prisma, type ActiveStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

/**
 * Instruktur beserta specialization dan jumlah event (event yang belum di-soft-delete).
 */
export interface InstructorRow {
  id: string;
  name: string;
  profilePicture: string | null;
  bio: string | null;
  contactInformation: string | null;
  status: ActiveStatus;
  createdAt: Date;
  specializations: { id: string; name: string }[];
  eventCount: number;
}

/**
 * Data untuk membuat/memperbarui instruktur.
 */
export interface InstructorData {
  name: string;
  profilePicture: string | null;
  bio: string | null;
  contactInformation: string | null;
  status: ActiveStatus;
  specializationIds: string[];
}

/**
 * Jumlah event yang menghalangi penghapusan instruktur.
 */
export interface InstructorEventLinks {
  /** Event draft/published yang belum di-soft-delete. */
  activeEvents: number;
  /** Semua event yang merujuk instruktur ini (termasuk completed dan yang di-soft-delete). */
  totalEvents: number;
}

/**
 * Dilempar bila instruktur masih dirujuk event saat dihapus (foreign key).
 */
export class InstructorInUseError extends Error {
  constructor() {
    super('Instructor is still referenced by events');
    this.name = 'InstructorInUseError';
  }
}

const include = {
  specializations: { include: { specialization: true } },
  _count: { select: { events: { where: { deletedAt: null } } } },
} satisfies Prisma.InstructorInclude;

type InstructorWithRelations = Prisma.InstructorGetPayload<{
  include: typeof include;
}>;

/**
 * Memetakan hasil Prisma ke InstructorRow (specialization diurutkan menurut nama).
 *
 * @param row - Instruktur dengan relasi.
 * @returns Baris instruktur.
 */
function toRow(row: InstructorWithRelations): InstructorRow {
  return {
    id: row.id,
    name: row.name,
    profilePicture: row.profilePicture,
    bio: row.bio,
    contactInformation: row.contactInformation,
    status: row.status,
    createdAt: row.createdAt,
    specializations: row.specializations
      .map((mapping) => ({
        id: mapping.specialization.id,
        name: mapping.specialization.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    eventCount: row._count.events,
  };
}

/**
 * Akses data tabel instructors dan mapping specialization.
 */
@Injectable()
export class InstructorsRepository {
  /**
   * @param prisma - Prisma client.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param status - Filter status (opsional).
   * @returns Instruktur urut nama.
   */
  async findMany(status?: ActiveStatus): Promise<InstructorRow[]> {
    const rows = await this.prisma.instructor.findMany({
      where: status ? { status } : undefined,
      include,
      orderBy: { name: 'asc' },
    });
    return rows.map(toRow);
  }

  /**
   * @param id - UUID instruktur.
   * @returns Instruktur atau null.
   */
  async findById(id: string): Promise<InstructorRow | null> {
    const row = await this.prisma.instructor.findUnique({
      where: { id },
      include,
    });
    return row ? toRow(row) : null;
  }

  /**
   * @param data - Data instruktur beserta id specialization (sudah divalidasi ada).
   * @returns Instruktur yang dibuat.
   */
  async create(data: InstructorData): Promise<InstructorRow> {
    const row = await this.prisma.instructor.create({
      data: {
        name: data.name,
        profilePicture: data.profilePicture,
        bio: data.bio,
        contactInformation: data.contactInformation,
        status: data.status,
        specializations: {
          create: data.specializationIds.map((specializationId) => ({
            specializationId,
          })),
        },
      },
      include,
    });
    return toRow(row);
  }

  /**
   * Memperbarui instruktur dan mengganti seluruh mapping specialization dalam satu operasi atomik.
   *
   * @param id - UUID instruktur.
   * @param data - Data baru.
   * @returns Instruktur setelah diperbarui.
   */
  async update(id: string, data: InstructorData): Promise<InstructorRow> {
    const row = await this.prisma.instructor.update({
      where: { id },
      data: {
        name: data.name,
        profilePicture: data.profilePicture,
        bio: data.bio,
        contactInformation: data.contactInformation,
        status: data.status,
        specializations: {
          deleteMany: {},
          create: data.specializationIds.map((specializationId) => ({
            specializationId,
          })),
        },
      },
      include,
    });
    return toRow(row);
  }

  /**
   * @param id - UUID instruktur.
   * @returns Jumlah event yang merujuk instruktur.
   */
  async countEventLinks(id: string): Promise<InstructorEventLinks> {
    const [activeEvents, totalEvents] = await Promise.all([
      this.prisma.event.count({
        where: {
          instructorId: id,
          deletedAt: null,
          status: { in: ['draft', 'published'] },
        },
      }),
      this.prisma.event.count({ where: { instructorId: id } }),
    ]);
    return { activeEvents, totalEvents };
  }

  /**
   * Menghapus instruktur. Template yang merujuknya dilepas (kolom `instructor_id` template nullable),
   * dan mapping specialization ikut terhapus (ON DELETE CASCADE).
   *
   * @param id - UUID instruktur.
   * @throws InstructorInUseError bila ternyata masih ada event yang merujuk (balapan).
   */
  async deleteDetachingTemplates(id: string): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.eventTemplate.updateMany({
          where: { instructorId: id },
          data: { instructorId: null },
        }),
        this.prisma.instructor.delete({ where: { id } }),
      ]);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new InstructorInUseError();
      }
      throw error;
    }
  }
}
