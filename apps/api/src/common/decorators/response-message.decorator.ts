import { SetMetadata } from '@nestjs/common';

/**
 * Kunci metadata untuk pesan sukses kustom.
 */
export const RESPONSE_MESSAGE_KEY = 'response_message';

/**
 * Mengatur field `message` pada response sukses (default: "Success").
 *
 * @param message - Pesan sukses (Bahasa Indonesia untuk pesan user-facing).
 * @returns Dekorator method.
 */
export const ResponseMessage = (message: string): MethodDecorator =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
