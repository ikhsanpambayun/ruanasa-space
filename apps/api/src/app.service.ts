import { Injectable } from '@nestjs/common';

/**
 * Data health check.
 */
export interface HealthStatus {
  status: 'ok';
  timestamp: string;
  uptime: number;
}

@Injectable()
export class AppService {
  /**
   * Mengembalikan status kesehatan aplikasi.
   *
   * @returns Status, waktu sekarang (ISO 8601 UTC), dan uptime proses dalam detik.
   */
  getHealth(): HealthStatus {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }
}
