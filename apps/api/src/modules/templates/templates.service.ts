import { HttpStatus, Injectable } from '@nestjs/common';

import { ERROR_CODES } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { toWibIsoString } from '../../common/utils/date.util';
import { InstructorsRepository } from '../instructors/instructors.repository';
import type { TemplateBodyDto } from './dto/template.dto';
import {
  TemplatesRepository,
  type TemplateData,
  type TemplateRow,
} from './templates.repository';

/** Item daftar template (API Spec v1.6 Section 7.1). */
export interface TemplateListItem {
  id: string;
  name: string;
  activity_type: string;
  instructor_name: string | null;
  created_at: string;
}

/** Detail template (API Spec v1.6 Section 7.2). */
export interface TemplateDetail extends TemplateListItem {
  description: string | null;
  instructor_id: string | null;
}

/**
 * Logika bisnis template event.
 */
@Injectable()
export class TemplatesService {
  /**
   * @param repository - Repository template.
   * @param instructors - Repository instruktur (validasi instruktur aktif).
   */
  constructor(
    private readonly repository: TemplatesRepository,
    private readonly instructors: InstructorsRepository,
  ) {}

  /**
   * @returns Daftar template.
   */
  async list(): Promise<TemplateListItem[]> {
    return (await this.repository.findAll()).map(toListItem);
  }

  /**
   * @param id - UUID template.
   * @returns Detail template.
   * @throws AppException 404 bila tidak ada.
   */
  async get(id: string): Promise<TemplateDetail> {
    return toDetail(await this.getOrFail(id));
  }

  /**
   * @param dto - Data template.
   * @returns Template yang dibuat.
   * @throws AppException 422 bila instruktur tidak ditemukan atau tidak aktif.
   */
  async create(dto: TemplateBodyDto): Promise<TemplateDetail> {
    const data = toData(dto);
    await this.assertInstructorUsable(data.instructorId);
    return toDetail(await this.repository.create(data));
  }

  /**
   * Mengganti seluruh data template. Instruktur hanya divalidasi bila berubah, sehingga template dengan
   * instruktur yang kini nonaktif tetap dapat diedit.
   *
   * @param id - UUID template.
   * @param dto - Data baru.
   * @returns Template setelah diperbarui.
   * @throws AppException 404 bila tidak ada; 422 bila instruktur baru tidak valid.
   */
  async update(id: string, dto: TemplateBodyDto): Promise<TemplateDetail> {
    const existing = await this.getOrFail(id);
    const data = toData(dto);
    if (data.instructorId !== existing.instructorId) {
      await this.assertInstructorUsable(data.instructorId);
    }
    return toDetail(await this.repository.update(id, data));
  }

  /**
   * Menghapus template; event yang dibuat darinya tidak terpengaruh.
   *
   * @param id - UUID template.
   * @throws AppException 404 bila tidak ada.
   */
  async remove(id: string): Promise<void> {
    await this.getOrFail(id);
    await this.repository.delete(id);
  }

  private async getOrFail(id: string): Promise<TemplateRow> {
    const found = await this.repository.findById(id);
    if (!found) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Template tidak ditemukan',
      );
    }
    return found;
  }

  private async assertInstructorUsable(
    instructorId: string | null,
  ): Promise<void> {
    if (!instructorId) {
      return;
    }
    const instructor = await this.instructors.findById(instructorId);
    if (!instructor || instructor.status !== 'active') {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ERROR_CODES.VALIDATION_ERROR,
        'Input tidak valid',
        {
          instructor_id: ['Instructor tidak ditemukan atau tidak aktif'],
        },
      );
    }
  }
}

/**
 * @param dto - Body request.
 * @returns Data repository (field opsional yang tidak dikirim menjadi null).
 */
function toData(dto: TemplateBodyDto): TemplateData {
  return {
    name: dto.name,
    activityType: dto.activity_type,
    description: dto.description ?? null,
    instructorId: dto.instructor_id ?? null,
  };
}

/**
 * @param row - Baris template.
 * @returns Item daftar untuk response.
 */
function toListItem(row: TemplateRow): TemplateListItem {
  return {
    id: row.id,
    name: row.name,
    activity_type: row.activityType,
    instructor_name: row.instructorName,
    created_at: toWibIsoString(row.createdAt),
  };
}

/**
 * @param row - Baris template.
 * @returns Detail untuk response.
 */
function toDetail(row: TemplateRow): TemplateDetail {
  return {
    ...toListItem(row),
    description: row.description,
    instructor_id: row.instructorId,
  };
}
