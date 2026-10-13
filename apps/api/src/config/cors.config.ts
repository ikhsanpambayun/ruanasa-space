import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Membuat konfigurasi CORS sesuai TAD v1.6 Section 8.6.
 * Request tanpa header Origin (server-to-server, curl) tidak diblokir oleh CORS.
 * CORS khusus webhook payment gateway ditambahkan saat modul payments dikerjakan.
 *
 * @param allowedOrigins - Daftar origin frontend yang diizinkan.
 * @returns Opsi CORS untuk `app.enableCors`.
 */
export function buildCorsOptions(allowedOrigins: string[]): CorsOptions {
  return {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Agar frontend dapat membaca token baru (sliding window) dari response.
    exposedHeaders: ['X-Refreshed-Token'],
  };
}
