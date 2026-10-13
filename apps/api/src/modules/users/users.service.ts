import { HttpStatus, Injectable } from '@nestjs/common';
import type { AttendanceStatus, AuthProvider, User } from '@prisma/client';

import { ERROR_CODES } from '../../common/constants/error-codes';
import { PaginatedResult } from '../../common/dto/paginated-result';
import {
  buildPagination,
  toPageWindow,
  type PaginationQueryDto,
} from '../../common/dto/pagination-query.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { formatDateOnly, toWibIsoString } from '../../common/utils/date.util';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { UserUniqueViolationError, UsersRepository } from './users.repository';

/** Profil user pada response (API Spec v1.6 Sections 4.1-4.2). Tidak memuat password_hash maupun role. */
export interface ProfileResponse {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  profile_picture: string | null;
  auth_provider: AuthProvider;
  created_at: string;
}

/** Satu item riwayat event (API Spec v1.6 Section 4.3). */
export interface EventHistoryItem {
  event_id: string;
  event_name: string;
  activity_type: string;
  date: string | null;
  location: string;
  attendance_status: AttendanceStatus;
  registration_status: 'confirmed';
}

/**
 * Logika bisnis profil user.
 */
@Injectable()
export class UsersService {
  /**
   * @param users - Repository user.
   */
  constructor(private readonly users: UsersRepository) {}

  /**
   * @param userId - UUID user dari token.
   * @returns Profil user.
   * @throws AppException 404 bila akun sudah tidak ada.
   */
  async getProfile(userId: string): Promise<ProfileResponse> {
    return toProfile(await this.getOrFail(userId));
  }

  /**
   * Memperbarui nama, email, dan nomor telepon. Nomor telepon (primary identifier) dicek lebih dulu,
   * lalu email; nilai yang sama dengan milik user sendiri tidak dianggap bentrok.
   *
   * @param userId - UUID user dari token.
   * @param dto - Nilai baru (sudah dinormalkan oleh DTO).
   * @returns Profil setelah diperbarui.
   * @throws AppException 404 bila akun tidak ada; 409 PHONE_ALREADY_EXISTS / EMAIL_ALREADY_EXISTS.
   */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    await this.getOrFail(userId);

    const phoneOwner = await this.users.findByPhone(dto.phone_number);
    if (phoneOwner && phoneOwner.id !== userId) {
      throw this.phoneTaken();
    }
    const emailOwner = await this.users.findByEmail(dto.email);
    if (emailOwner && emailOwner.id !== userId) {
      throw this.emailTaken();
    }

    try {
      const updated = await this.users.updateProfile(userId, {
        name: dto.name,
        email: dto.email,
        phoneNumber: dto.phone_number,
      });
      return toProfile(updated);
    } catch (error) {
      if (error instanceof UserUniqueViolationError) {
        throw error.field === 'email' ? this.emailTaken() : this.phoneTaken();
      }
      throw error;
    }
  }

  /**
   * Riwayat event user (registrasi confirmed), terbaru lebih dulu.
   *
   * @param userId - UUID user dari token.
   * @param query - Pagination.
   * @returns Halaman riwayat event.
   */
  async getEventHistory(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<EventHistoryItem>> {
    const { rows, total } = await this.users.findEventHistory(
      userId,
      toPageWindow(query),
    );
    const items = rows.map((row): EventHistoryItem => ({
      event_id: row.eventId,
      event_name: row.eventName,
      activity_type: row.activityType,
      date: formatDateOnly(row.date),
      location: row.location,
      attendance_status: row.attendanceStatus,
      registration_status: 'confirmed',
    }));
    return new PaginatedResult(items, buildPagination(query, total));
  }

  private async getOrFail(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Akun tidak ditemukan',
      );
    }
    return user;
  }

  private phoneTaken(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      ERROR_CODES.PHONE_ALREADY_EXISTS,
      'Nomor telepon sudah digunakan akun lain',
    );
  }

  private emailTaken(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      ERROR_CODES.EMAIL_ALREADY_EXISTS,
      'Email sudah digunakan akun lain',
    );
  }
}

/**
 * Memetakan user ke response profil.
 *
 * @param user - Baris tabel users.
 * @returns Profil tanpa field sensitif.
 */
function toProfile(user: User): ProfileResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone_number: user.phoneNumber,
    profile_picture: user.profilePicture,
    auth_provider: user.authProvider,
    created_at: toWibIsoString(user.createdAt),
  };
}
