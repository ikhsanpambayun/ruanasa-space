import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type ActiveStatus,
  type DiscountCode,
  type DiscountType,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

/**
 * Data untuk membuat kode promo.
 */
export interface CreateDiscountCodeData {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  quota: number;
  /** Tanggal (UTC tengah malam) terakhir kode berlaku. */
  expiryDate: Date;
  status: ActiveStatus;
}

/**
 * Data yang dapat diubah pada kode promo. Kode (`code`) tidak dapat diubah setelah dibuat.
 */
export type UpdateDiscountCodeData = Omit<CreateDiscountCodeData, 'code'>;

/**
 * Dilempar saat kode promo melanggar unique constraint.
 */
export class DiscountCodeTakenError extends Error {
  constructor() {
    super('Discount code already exists');
    this.name = 'DiscountCodeTakenError';
  }
}

/**
 * Akses data tabel discount_codes.
 */
@Injectable()
export class DiscountsRepository {
  /**
   * @param prisma - Prisma client.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Daftar kode promo, terbaru lebih dulu.
   *
   * @param filter - Status (opsional) serta offset dan batas baris.
   * @returns Baris pada halaman ini dan total seluruh baris yang cocok.
   */
  async findMany(filter: {
    status?: ActiveStatus;
    skip: number;
    take: number;
  }): Promise<{ rows: DiscountCode[]; total: number }> {
    const where: Prisma.DiscountCodeWhereInput = filter.status
      ? { status: filter.status }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.discountCode.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.discountCode.count({ where }),
    ]);
    return { rows, total };
  }

  /**
   * @param id - UUID kode promo.
   * @returns Kode promo atau null.
   */
  findById(id: string): Promise<DiscountCode | null> {
    return this.prisma.discountCode.findUnique({ where: { id } });
  }

  /**
   * @param code - Kode (huruf besar).
   * @returns Kode promo atau null.
   */
  findByCode(code: string): Promise<DiscountCode | null> {
    return this.prisma.discountCode.findUnique({ where: { code } });
  }

  /**
   * @param data - Data kode promo.
   * @returns Kode promo yang dibuat.
   * @throws DiscountCodeTakenError bila kode sudah ada.
   */
  async create(data: CreateDiscountCodeData): Promise<DiscountCode> {
    try {
      return await this.prisma.discountCode.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new DiscountCodeTakenError();
      }
      throw error;
    }
  }

  /**
   * @param id - UUID kode promo.
   * @param data - Nilai baru.
   * @returns Kode promo setelah diperbarui.
   */
  update(id: string, data: UpdateDiscountCodeData): Promise<DiscountCode> {
    return this.prisma.discountCode.update({ where: { id }, data });
  }
}
