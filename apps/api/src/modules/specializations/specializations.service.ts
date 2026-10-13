import { HttpStatus, Injectable } from '@nestjs/common';

import { ERROR_CODES } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import {
  SpecializationNameTakenError,
  SpecializationsRepository,
  type SpecializationRow,
} from './specializations.repository';

/**
 * Representasi specialization pada response (API Spec v1.6 Section 9).
 */
export interface SpecializationResponse {
  id: string;
  name: string;
  instructor_count: number;
}

/**
 * Logika bisnis specialization (tag keahlian instruktur).
 */
@Injectable()
export class SpecializationsService {
  /**
   * @param repository - Repository specialization.
   */
  constructor(private readonly repository: SpecializationsRepository) {}

  /**
   * @returns Semua specialization dengan jumlah instruktur.
   */
  async list(): Promise<SpecializationResponse[]> {
    return (await this.repository.findAll()).map(toResponse);
  }

  /**
   * Membuat specialization. Nama harus unik tanpa membedakan huruf besar/kecil.
   *
   * @param name - Nama specialization.
   * @returns Specialization baru.
   * @throws AppException 409 SPECIALIZATION_EXISTS bila nama sudah ada.
   */
  async create(name: string): Promise<SpecializationResponse> {
    if (await this.repository.findByName(name)) {
      throw this.nameTaken();
    }
    try {
      return toResponse(await this.repository.create(name));
    } catch (error) {
      throw error instanceof SpecializationNameTakenError
        ? this.nameTaken()
        : error;
    }
  }

  /**
   * Mengubah nama specialization.
   *
   * @param id - UUID specialization.
   * @param name - Nama baru.
   * @returns Specialization setelah diperbarui.
   * @throws AppException 404 bila tidak ada; 409 SPECIALIZATION_EXISTS bila nama dipakai specialization lain.
   */
  async update(id: string, name: string): Promise<SpecializationResponse> {
    await this.getOrFail(id);
    const sameName = await this.repository.findByName(name);
    if (sameName && sameName.id !== id) {
      throw this.nameTaken();
    }
    try {
      return toResponse(await this.repository.update(id, name));
    } catch (error) {
      throw error instanceof SpecializationNameTakenError
        ? this.nameTaken()
        : error;
    }
  }

  /**
   * Menghapus specialization (mapping ke instruktur ikut terhapus).
   *
   * @param id - UUID specialization.
   * @throws AppException 404 bila tidak ada.
   */
  async remove(id: string): Promise<void> {
    await this.getOrFail(id);
    await this.repository.delete(id);
  }

  private async getOrFail(id: string): Promise<SpecializationRow> {
    const found = await this.repository.findById(id);
    if (!found) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Specialization tidak ditemukan',
      );
    }
    return found;
  }

  private nameTaken(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      ERROR_CODES.SPECIALIZATION_EXISTS,
      'Specialization sudah ada',
    );
  }
}

/**
 * Memetakan baris repository ke response API (snake_case).
 *
 * @param row - Specialization dari repository.
 * @returns Objek response.
 */
function toResponse(row: SpecializationRow): SpecializationResponse {
  return { id: row.id, name: row.name, instructor_count: row.instructorCount };
}
