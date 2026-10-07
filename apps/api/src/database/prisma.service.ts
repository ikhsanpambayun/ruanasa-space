import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import type { Env } from '../config/env.validation';

/**
 * Prisma Client singleton. Memakai DATABASE_URL (PgBouncer, port 6543 di Supabase);
 * DIRECT_URL hanya dipakai Prisma CLI untuk migrasi.
 * Koneksi dibuka saat startup agar aplikasi gagal cepat bila database tidak dapat dijangkau.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /**
   * @param config - Konfigurasi aplikasi (untuk DATABASE_URL).
   */
  constructor(config: ConfigService<Env, true>) {
    super({
      datasourceUrl: config.get('DATABASE_URL', { infer: true }),
      log: ['warn', 'error'],
    });
  }

  /**
   * Membuka koneksi database saat modul diinisialisasi.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  /**
   * Menutup koneksi database saat aplikasi berhenti.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
