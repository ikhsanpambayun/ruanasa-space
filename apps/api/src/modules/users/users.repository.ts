import { Injectable } from '@nestjs/common';
import { Prisma, type AuthProvider, type User } from '@prisma/client';

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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = JSON.stringify(error.meta?.target ?? '');
        if (target.includes('phone')) {
          throw new UserUniqueViolationError('phone_number');
        }
        if (target.includes('email')) {
          throw new UserUniqueViolationError('email');
        }
        throw new UserUniqueViolationError('unknown');
      }
      throw error;
    }
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
}
