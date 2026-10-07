/**
 * Hasil pengiriman pesan lewat provider eksternal. Adapter tidak melempar error untuk kegagalan
 * provider; pemanggil memeriksa `success`.
 */
export interface SendResult {
  success: boolean;
  /** Alasan kegagalan untuk log internal (bahasa Inggris, tanpa data pribadi). */
  error?: string;
}
