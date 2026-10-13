import { HttpStatus, Injectable } from '@nestjs/common';
import type { ActiveStatus } from '@prisma/client';

import { ERROR_CODES } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { toWibIsoString } from '../../common/utils/date.util';
import { SpecializationsRepository } from '../specializations/specializations.repository';
import type { InstructorBodyDto } from './dto/instructor.dto';
import {
  InstructorInUseError,
  InstructorsRepository,
  type InstructorData,
  type InstructorRow,
} from './instructors.repository';

/** Item pada daftar instruktur (API Spec v1.6 Section 8.1). */
export interface InstructorListItem {
  id: string;
  name: string;
  profile_picture: string | null;
  specializations: string[];
  status: ActiveStatus;
  event_count: number;
}

/** Detail instruktur (API Spec v1.6 Section 8.2). */
export interface InstructorDetail {
  id: string;
  name: string;
  profile_picture: string | null;
  bio: string | null;
  contact_information: string | null;
  specializations: { id: string; name: string }[];
  status: ActiveStatus;
  event_count: number;
  created_at: string;
}

/** Item dropdown instruktur aktif (API Spec v1.6 Section 8.6). */
export interface ActiveInstructorItem {
  id: string;
  name: string;
  specializations: string[];
}

const ACTIVE_EVENT_MESSAGE =
  'Tidak dapat menghapus instructor yang terhubung dengan event aktif';
const PAST_EVENT_MESSAGE =
  'Instructor pernah mengajar event sehingga tidak dapat dihapus. Nonaktifkan instructor jika tidak ingin ditampilkan lagi';

/**
 * Logika bisnis instruktur.
 */
@Injectable()
export class InstructorsService {
  /**
   * @param repository - Repository instruktur.
   * @param specializations - Repository specialization (validasi `specialization_ids`).
   */
  constructor(
    private readonly repository: InstructorsRepository,
    private readonly specializations: SpecializationsRepository,
  ) {}

  /**
   * @param status - Filter status (opsional).
   * @returns Daftar instruktur.
   */
  async list(status?: ActiveStatus): Promise<InstructorListItem[]> {
    return (await this.repository.findMany(status)).map((row) => ({
      id: row.id,
      name: row.name,
      profile_picture: row.profilePicture,
      specializations: row.specializations.map((s) => s.name),
      status: row.status,
      event_count: row.eventCount,
    }));
  }

  /**
   * @returns Instruktur berstatus active untuk dropdown form event.
   */
  async listActive(): Promise<ActiveInstructorItem[]> {
    return (await this.repository.findMany('active')).map((row) => ({
      id: row.id,
      name: row.name,
      specializations: row.specializations.map((s) => s.name),
    }));
  }

  /**
   * @param id - UUID instruktur.
   * @returns Detail instruktur.
   * @throws AppException 404 bila tidak ada.
   */
  async get(id: string): Promise<InstructorDetail> {
    return toDetail(await this.getOrFail(id));
  }

  /**
   * @param dto - Data instruktur.
   * @returns Instruktur yang dibuat.
   * @throws AppException 422 bila ada specialization_ids yang tidak ditemukan.
   */
  async create(dto: InstructorBodyDto): Promise<InstructorDetail> {
    const data = await this.toData(dto);
    return toDetail(await this.repository.create(data));
  }

  /**
   * Mengganti seluruh data instruktur, termasuk daftar specialization. Field opsional yang tidak dikirim di-reset,\n   * kecuali status yang dipertahankan agar update tidak mengaktifkan kembali instruktur nonaktif.
   *
   * @param id - UUID instruktur.
   * @param dto - Data baru.
   * @returns Instruktur setelah diperbarui.
   * @throws AppException 404 bila tidak ada; 422 bila ada specialization_ids yang tidak ditemukan.
   */
  async update(id: string, dto: InstructorBodyDto): Promise<InstructorDetail> {
    const existing = await this.getOrFail(id);
    const data = await this.toData(dto, existing.status);
    return toDetail(await this.repository.update(id, data));
  }

  /**
   * Menghapus instruktur yang tidak terhubung ke event mana pun. Event aktif (draft/published)
   * dan event lama (completed) sama-sama menghalangi, karena riwayat event harus tetap utuh.
   *
   * @param id - UUID instruktur.
   * @throws AppException 404 bila tidak ada; 403 INSTRUCTOR_HAS_ACTIVE_EVENT bila terhubung ke event.
   */
  async remove(id: string): Promise<void> {
    await this.getOrFail(id);
    const links = await this.repository.countEventLinks(id);
    if (links.activeEvents > 0) {
      throw this.inUse(ACTIVE_EVENT_MESSAGE);
    }
    if (links.totalEvents > 0) {
      throw this.inUse(PAST_EVENT_MESSAGE);
    }
    try {
      await this.repository.deleteDetachingTemplates(id);
    } catch (error) {
      throw error instanceof InstructorInUseError
        ? this.inUse(ACTIVE_EVENT_MESSAGE)
        : error;
    }
  }

  private async getOrFail(id: string): Promise<InstructorRow> {
    const found = await this.repository.findById(id);
    if (!found) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Instructor tidak ditemukan',
      );
    }
    return found;
  }

  private async toData(
    dto: InstructorBodyDto,
    currentStatus: ActiveStatus = 'active',
  ): Promise<InstructorData> {
    const specializationIds = dto.specialization_ids ?? [];
    const existing = new Set(
      await this.specializations.findExistingIds(specializationIds),
    );
    if (specializationIds.some((id) => !existing.has(id))) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ERROR_CODES.VALIDATION_ERROR,
        'Input tidak valid',
        { specialization_ids: ['Specialization tidak ditemukan'] },
      );
    }
    return {
      name: dto.name,
      profilePicture: dto.profile_picture ?? null,
      bio: dto.bio ?? null,
      contactInformation: dto.contact_information ?? null,
      status: dto.status ?? currentStatus,
      specializationIds,
    };
  }

  private inUse(message: string): AppException {
    return new AppException(
      HttpStatus.FORBIDDEN,
      ERROR_CODES.INSTRUCTOR_HAS_ACTIVE_EVENT,
      message,
    );
  }
}

/**
 * Memetakan baris repository ke detail instruktur untuk response API.
 *
 * @param row - Instruktur dari repository.
 * @returns Objek detail (snake_case, timestamp WIB).
 */
function toDetail(row: InstructorRow): InstructorDetail {
  return {
    id: row.id,
    name: row.name,
    profile_picture: row.profilePicture,
    bio: row.bio,
    contact_information: row.contactInformation,
    specializations: row.specializations,
    status: row.status,
    event_count: row.eventCount,
    created_at: toWibIsoString(row.createdAt),
  };
}
