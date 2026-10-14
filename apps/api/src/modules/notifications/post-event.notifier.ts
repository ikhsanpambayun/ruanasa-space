import { Injectable, Logger } from '@nestjs/common';

/**
 * Kontrak pengirim notifikasi post-event: satu pesan WhatsApp per buyer berisi link feedback untuk setiap
 * peserta yang hadir (API Spec v1.6 Section 23.4). Dipanggil saat event di-complete dan oleh trigger manual.
 * Implementasi sesungguhnya (PostEventService) dikerjakan di P6-BE-004.
 */
export abstract class PostEventNotifier {
  /**
   * Mengirim notifikasi post-event untuk satu event yang sudah completed.
   *
   * @param eventId - UUID event.
   */
  abstract notifyEventCompleted(eventId: string): Promise<void>;
}

/**
 * Pengganti sementara sampai P6-BE-004: TIDAK mengirim pesan apa pun, hanya mencatat peringatan di log.
 * Harus diganti sebelum fitur feedback dipakai nyata.
 */
@Injectable()
export class StubPostEventNotifier extends PostEventNotifier {
  private readonly logger = new Logger(StubPostEventNotifier.name);

  /**
   * @param eventId - UUID event.
   */
  notifyEventCompleted(eventId: string): Promise<void> {
    this.logger.warn(
      `Post-event notification for event ${eventId} was NOT sent: PostEventService is not implemented yet (P6-BE-004)`,
    );
    return Promise.resolve();
  }
}
