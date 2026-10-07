/**
 * Pembungkus return controller untuk endpoint yang pesan suksesnya bergantung pada hasil
 * (misalnya login existing user vs user baru). Dibaca oleh TransformInterceptor.
 */
export class ResponseWithMessage<T> {
  /**
   * @param data - Isi `data` pada response.
   * @param message - Pesan sukses (Bahasa Indonesia).
   */
  constructor(
    readonly data: T,
    readonly message: string,
  ) {}
}
