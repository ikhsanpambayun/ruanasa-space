import { Injectable, OnModuleDestroy } from '@nestjs/common';

export type OtpChannel = 'email' | 'whatsapp';

/**
 * Sesi OTP. Kode asli tidak pernah disimpan, hanya hash SHA-256-nya.
 */
export interface OtpSession {
  id: string;
  channel: OtpChannel;
  /** Email (kanal email) atau nomor telepon kanonik (kanal WhatsApp). */
  identifier: string;
  codeHash: string;
  /** Waktu kedaluwarsa, epoch milidetik. */
  expiresAt: number;
  /** Jumlah percobaan salah. */
  attempts: number;
  /** True setelah batas percobaan salah tercapai; sesi tidak dapat dipakai lagi. */
  locked: boolean;
}

/**
 * Kontrak penyimpanan sesi OTP dan penghitung rate limit per identifier.
 * Implementasi MVP in-memory; ganti dengan Redis bila backend dijalankan lebih dari satu instance.
 */
export abstract class OtpStore {
  /** Menyimpan sesi, menggantikan sesi lama dengan id sama. */
  abstract save(session: OtpSession): void;
  /** Mengambil sesi berdasarkan id, atau undefined. */
  abstract get(id: string): OtpSession | undefined;
  /** Menghapus sesi berdasarkan id. */
  abstract delete(id: string): void;
  /**
   * Menghapus semua sesi milik satu identifier (agar hanya OTP terbaru yang berlaku).
   *
   * @param exceptId - Id sesi yang dipertahankan (sesi terbaru).
   */
  abstract deleteByIdentifier(
    channel: OtpChannel,
    identifier: string,
    exceptId?: string,
  ): void;
  /**
   * Mencoba mereservasi satu slot request dalam jendela waktu.
   *
   * @returns Timestamp reservasi bila diizinkan, atau null bila batas tercapai.
   */
  abstract reserveRequest(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): number | null;
  /** Melepas reservasi (dipakai bila pengiriman gagal sehingga tidak menghabiskan jatah user). */
  abstract releaseRequest(key: string, timestamp: number): void;
}

const CLEANUP_INTERVAL_MS = 60_000;
const MAX_REQUEST_WINDOW_MS = 15 * 60_000;

/**
 * Implementasi in-memory OtpStore. Data hilang saat proses restart (OTP aktif harus direquest ulang).
 */
@Injectable()
export class InMemoryOtpStore extends OtpStore implements OnModuleDestroy {
  private readonly sessions = new Map<string, OtpSession>();
  private readonly requests = new Map<string, number[]>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    super();
    this.cleanupTimer = setInterval(
      () => this.removeExpired(Date.now()),
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

  save(session: OtpSession): void {
    this.sessions.set(session.id, session);
  }

  get(id: string): OtpSession | undefined {
    return this.sessions.get(id);
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  deleteByIdentifier(
    channel: OtpChannel,
    identifier: string,
    exceptId?: string,
  ): void {
    for (const [id, session] of this.sessions) {
      if (
        id !== exceptId &&
        session.channel === channel &&
        session.identifier === identifier
      ) {
        this.sessions.delete(id);
      }
    }
  }

  reserveRequest(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): number | null {
    const recent = (this.requests.get(key) ?? []).filter(
      (timestamp) => now - timestamp < windowMs,
    );
    if (recent.length >= limit) {
      this.requests.set(key, recent);
      return null;
    }
    recent.push(now);
    this.requests.set(key, recent);
    return now;
  }

  releaseRequest(key: string, timestamp: number): void {
    const current = this.requests.get(key);
    if (!current) {
      return;
    }
    const index = current.indexOf(timestamp);
    if (index >= 0) {
      current.splice(index, 1);
    }
  }

  /**
   * Menghapus sesi kedaluwarsa dan catatan request di luar jendela waktu.
   *
   * @param now - Waktu sekarang (epoch milidetik).
   */
  removeExpired(now: number): void {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
      }
    }
    for (const [key, timestamps] of this.requests) {
      const recent = timestamps.filter(
        (timestamp) => now - timestamp < MAX_REQUEST_WINDOW_MS,
      );
      if (recent.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, recent);
      }
    }
  }
}
