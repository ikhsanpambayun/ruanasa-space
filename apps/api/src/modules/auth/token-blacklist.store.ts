import { createHash } from 'node:crypto';

import { Injectable, OnModuleDestroy } from '@nestjs/common';

const CLEANUP_INTERVAL_MS = 60_000;

/**
 * Penyimpanan in-memory untuk token yang di-logout dan temp_token yang sudah dipakai (TAD v1.6 Section 4.10).
 * Entri dihapus otomatis setelah kedaluwarsa. Data hilang saat proses restart dan tidak dibagi antar instance;
 * jika backend dijalankan lebih dari satu instance, ganti dengan penyimpanan terpusat (Redis).
 */
@Injectable()
export class TokenBlacklistStore implements OnModuleDestroy {
  private readonly entries = new Map<string, number>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(
      () => this.removeExpired(),
      CLEANUP_INTERVAL_MS,
    );
    this.cleanupTimer.unref();
  }

  /**
   * Menghentikan timer pembersihan saat aplikasi berhenti.
   */
  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  /**
   * Memasukkan token ke blacklist sampai waktu kedaluwarsanya. Yang disimpan adalah hash SHA-256,
   * bukan token asli.
   *
   * @param token - JWT yang tidak boleh dipakai lagi.
   * @param expiresAt - Waktu kedaluwarsa token (epoch detik).
   */
  addToken(token: string, expiresAt: number): void {
    this.entries.set(this.hashKey(token), expiresAt);
  }

  /**
   * Memeriksa apakah token sudah di-blacklist.
   *
   * @param token - JWT yang diperiksa.
   * @returns True bila token tidak boleh dipakai.
   */
  hasToken(token: string): boolean {
    return this.isActive(this.hashKey(token));
  }

  /**
   * Menandai temp_token (berdasarkan jti) sebagai sudah dipakai.
   *
   * @param jti - ID unik temp_token.
   * @param expiresAt - Waktu kedaluwarsa temp_token (epoch detik).
   */
  markTempTokenUsed(jti: string, expiresAt: number): void {
    this.entries.set(`jti:${jti}`, expiresAt);
  }

  /**
   * Memeriksa apakah temp_token sudah pernah dipakai.
   *
   * @param jti - ID unik temp_token.
   * @returns True bila sudah dipakai.
   */
  isTempTokenUsed(jti: string): boolean {
    return this.isActive(`jti:${jti}`);
  }

  /**
   * Menghapus semua entri yang sudah kedaluwarsa.
   */
  removeExpired(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private isActive(key: string): boolean {
    const expiresAt = this.entries.get(key);
    if (expiresAt === undefined) {
      return false;
    }
    if (expiresAt <= Math.floor(Date.now() / 1000)) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  private hashKey(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
