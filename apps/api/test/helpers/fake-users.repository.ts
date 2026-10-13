import { randomUUID } from 'node:crypto';

import type { AuthProvider, User } from '@prisma/client';

import {
  UserUniqueViolationError,
  type CreateUserData,
  type EventHistoryRow,
  type UpdateProfileData,
} from '../../src/modules/users/users.repository';

/**
 * Repository user in-memory untuk test e2e. Meniru perilaku database: unique phone/email
 * (termasuk akun soft-deleted) dan filter soft delete pada pencarian.
 */
export class FakeUsersRepository {
  readonly users = new Map<string, User>();
  /** Riwayat event per user yang diatur test (sudah terurut seperti hasil repository). */
  readonly history = new Map<string, EventHistoryRow[]>();

  /**
   * Menambahkan user langsung ke penyimpanan (setup test).
   *
   * @param overrides - Nilai yang menimpa default.
   * @returns User yang tersimpan.
   */
  add(overrides: Partial<User> = {}): User {
    const id = overrides.id ?? randomUUID();
    const user: User = {
      id,
      name: 'Tes User',
      phoneNumber: `08${Math.floor(Math.random() * 1e10)
        .toString()
        .padStart(10, '0')}`,
      email: `${id}@example.com`,
      role: 'participant',
      authProvider: 'auto_created',
      passwordHash: null,
      profilePicture: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    };
    this.users.set(id, user);
    return user;
  }

  /** Mencari user aktif berdasarkan id. */
  findById(id: string): Promise<User | null> {
    return Promise.resolve(
      this.active().find((user) => user.id === id) ?? null,
    );
  }

  /** Mencari user aktif berdasarkan email. */
  findByEmail(email: string): Promise<User | null> {
    return Promise.resolve(
      this.active().find((user) => user.email === email) ?? null,
    );
  }

  /** Mencari user aktif berdasarkan nomor telepon. */
  findByPhone(phoneNumber: string): Promise<User | null> {
    return Promise.resolve(
      this.active().find((user) => user.phoneNumber === phoneNumber) ?? null,
    );
  }

  /** Membuat user; menolak phone/email duplikat seperti unique constraint database. */
  create(data: CreateUserData): Promise<User> {
    const all = [...this.users.values()];
    if (all.some((user) => user.phoneNumber === data.phoneNumber)) {
      return Promise.reject(new UserUniqueViolationError('phone_number'));
    }
    if (all.some((user) => user.email === data.email)) {
      return Promise.reject(new UserUniqueViolationError('email'));
    }
    return Promise.resolve(
      this.add({
        name: data.name,
        phoneNumber: data.phoneNumber,
        email: data.email,
        authProvider: data.authProvider,
        profilePicture: data.profilePicture ?? null,
      }),
    );
  }

  /** Memperbarui auth_provider user. */
  updateAuthProvider(id: string, authProvider: AuthProvider): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      return Promise.reject(new Error('User not found'));
    }
    const updated = { ...user, authProvider };
    this.users.set(id, updated);
    return Promise.resolve(updated);
  }

  /** Memperbarui profil; menolak phone/email yang dipakai akun lain (termasuk soft-deleted) seperti unique constraint. */
  updateProfile(id: string, data: UpdateProfileData): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      return Promise.reject(new Error('User not found'));
    }
    const others = [...this.users.values()].filter((other) => other.id !== id);
    if (others.some((other) => other.phoneNumber === data.phoneNumber)) {
      return Promise.reject(new UserUniqueViolationError('phone_number'));
    }
    if (others.some((other) => other.email === data.email)) {
      return Promise.reject(new UserUniqueViolationError('email'));
    }
    const updated = {
      ...user,
      name: data.name,
      email: data.email,
      phoneNumber: data.phoneNumber,
    };
    this.users.set(id, updated);
    return Promise.resolve(updated);
  }

  /** Riwayat event dari data yang diatur test, dengan pagination. */
  findEventHistory(
    userId: string,
    window: { skip: number; take: number },
  ): Promise<{ rows: EventHistoryRow[]; total: number }> {
    const all = this.history.get(userId) ?? [];
    return Promise.resolve({
      rows: all.slice(window.skip, window.skip + window.take),
      total: all.length,
    });
  }
  private active(): User[] {
    return [...this.users.values()].filter((user) => user.deletedAt === null);
  }
}
