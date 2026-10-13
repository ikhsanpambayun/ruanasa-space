import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type AttendanceStatus,
  type AuthProvider,
  type User,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

/**
 * Data untuk membuat user baru. phoneNumber harus sudah kanonik (08xxxxxxxxxx) dan email lowercase.
 */
export interface CreateUserData {
  name: string;
  phoneNumber: string;
  email: string;
  authProvider: AuthProvider;
  profilePicture?: string | null;
}

/**
 * Data profil yang dapat diubah user. Nomor kanonik (08xxxxxxxxxx) dan email lowercase.
 */
export interface UpdateProfileData {
  name: string;
  email: string;
  phoneNumber: string;
}

/**
 * Satu baris riwayat event user (registrasi confirmed beserta status kehadiran).
 */
export interface EventHistoryRow {
  eventId: string;
  eventName: string;
  activityType: string;
  /** Tanggal event (UTC tengah malam), atau null bila belum diisi. */
  date: Date | null;
  location: string;
  attendanceStatus: AttendanceStatus;
}

/**
 * Dilempar saat insert melanggar unique constraint phone_number atau email.
 */
export class UserUniqueViolationError extends Error {
  /**
   * @param field - Kolom yang melanggar constraint.
   */
  constructor(readonly field: 'phone_number' | 'email' | 'unknown') {
    super(`Unique constraint violated on users.${field}`);
    this.name = 'UserUniqueViolationError';
  }
}

/**
 * Akses data tabel users. Semua query membaca hanya baris yang belum di-soft-delete.
 */
@Injectable()
export class UsersRepository {
  /**
   * @param prisma - Prisma client.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mencari user aktif berdasarkan id.
   *
   * @param id - UUID user.
   * @returns User atau null bila tidak ada / sudah dihapus.
   */
  findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  /**
   * Mencari user aktif berdasarkan email (sudah lowercase).
   *
   * @param email - Email kanonik.
   * @returns User atau null.
   */
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }

  /**
   * Mencari user aktif berdasarkan nomor telepon kanonik.
   *
   * @param phoneNumber - Nomor format 08xxxxxxxxxx.
   * @returns User atau null.
   */
  findByPhone(phoneNumber: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { phoneNumber, deletedAt: null },
    });
  }

  /**
   * Membuat user participant baru.
   *
   * @param data - Data user.
   * @returns User yang dibuat.
   * @throws UserUniqueViolationError bila phone_number atau email sudah dipakai (termasuk akun soft-deleted).
   */
  async create(data: CreateUserData): Promise<User> {
    try {
      return await this.prisma.user.create({
        data: {
          name: data.name,
          phoneNumber: data.phoneNumber,
          email: data.email,
          authProvider: data.authProvider,
          profilePicture: data.profilePicture ?? null,
          role: 'participant',
        },
      });
    } catch (error) {
      throw this.translateUnique(error);
    }
  }

  /**
   * Memperbarui profil user (nama, email, nomor telepon).
   *
   * @param id - UUID user.
   * @param data - Nilai baru yang sudah dinormalkan.
   * @returns User setelah diperbarui.
   * @throws UserUniqueViolationError bila phone_number atau email dipakai akun lain (termasuk akun soft-deleted).
   */
  async updateProfile(id: string, data: UpdateProfileData): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          name: data.name,
          email: data.email,
          phoneNumber: data.phoneNumber,
        },
      });
    } catch (error) {
      throw this.translateUnique(error);
    }
  }

  /**
   * Riwayat event user: semua registrasi confirmed milik user (sebagai pembeli), terbaru lebih dulu.
   * Status kehadiran diambil dari peserta yang merujuk user ini; `not_checked` bila user tidak terdaftar
   * sebagai peserta pada registrasi tersebut.
   *
   * @param userId - UUID user.
   * @param window - Offset dan batas baris.
   * @returns Baris pada halaman ini dan total seluruh registrasi confirmed.
   */
  async findEventHistory(
    userId: string,
    window: { skip: number; take: number },
  ): Promise<{ rows: EventHistoryRow[]; total: number }> {
    const where: Prisma.RegistrationWhereInput = {
      buyerUserId: userId,
      registrationStatus: 'confirmed',
      deletedAt: null,
    };
    const [registrations, total] = await Promise.all([
      this.prisma.registration.findMany({
        where,
        include: {
          event: true,
          participants: { where: { userId }, include: { attendance: true } },
        },
        orderBy: [
          { event: { date: { sort: 'desc', nulls: 'last' } } },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
        skip: window.skip,
        take: window.take,
      }),
      this.prisma.registration.count({ where }),
    ]);

    const rows = registrations.map((registration): EventHistoryRow => {
      const statuses = registration.participants.flatMap((participant) =>
        participant.attendance.map((attendance) => attendance.status),
      );
      return {
        eventId: registration.event.id,
        eventName: registration.event.eventName,
        activityType: registration.event.activityType,
        date: registration.event.date,
        location: registration.event.location,
        attendanceStatus: statuses.includes('present')
          ? 'present'
          : 'not_checked',
      };
    });
    return { rows, total };
  }

  /**
   * Memperbarui metode login terakhir user (account linking).
   *
   * @param id - UUID user.
   * @param authProvider - Metode login terbaru.
   * @returns User setelah diperbarui.
   */
  updateAuthProvider(id: string, authProvider: AuthProvider): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { authProvider } });
  }

  /**
   * Menerjemahkan pelanggaran unique constraint Prisma (P2002) menjadi UserUniqueViolationError.
   *
   * @param error - Error dari Prisma.
   * @returns Error domain untuk P2002, atau error aslinya.
   */
  private translateUnique(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = JSON.stringify(error.meta?.target ?? '');
      if (target.includes('phone')) {
        return new UserUniqueViolationError('phone_number');
      }
      if (target.includes('email')) {
        return new UserUniqueViolationError('email');
      }
      return new UserUniqueViolationError('unknown');
    }
    return error;
  }
}
