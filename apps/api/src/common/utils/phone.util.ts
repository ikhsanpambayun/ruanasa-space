/**
 * Format kanonik nomor telepon yang disimpan di database: nomor seluler Indonesia dengan awalan 0
 * (contoh: 081234567890), 10-13 digit.
 */
export const CANONICAL_PHONE_PATTERN = /^08\d{8,11}$/;

/**
 * Menormalkan input nomor telepon ke format kanonik. Menerima spasi, strip, titik, tanda kurung,
 * serta awalan +62, 62, 0, atau tanpa awalan (8xxx). Input yang tidak dikenali dikembalikan
 * apa adanya (setelah dibersihkan) agar ditolak oleh validator.
 *
 * @param raw - Nomor telepon dari user.
 * @returns Nomor dalam format 08xxxxxxxxxx bila valid, atau string hasil pembersihan.
 */
export function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, '');

  if (cleaned.startsWith('+62')) {
    return `0${cleaned.slice(3)}`;
  }
  if (cleaned.startsWith('62')) {
    return `0${cleaned.slice(2)}`;
  }
  if (cleaned.startsWith('8')) {
    return `0${cleaned}`;
  }
  return cleaned;
}

/**
 * Memeriksa apakah nomor sudah dalam format kanonik nomor seluler Indonesia.
 *
 * @param phone - Nomor yang sudah dinormalkan.
 * @returns True bila valid.
 */
export function isValidIndonesianMobile(phone: string): boolean {
  return CANONICAL_PHONE_PATTERN.test(phone);
}

/**
 * Mengubah nomor kanonik ke format internasional tanpa plus (628xxxxxxxxxx) untuk provider WhatsApp.
 *
 * @param phone - Nomor kanonik (08xxxxxxxxxx).
 * @returns Nomor format 628xxxxxxxxxx.
 */
export function toInternationalPhone(phone: string): string {
  return phone.startsWith('0') ? `62${phone.slice(1)}` : phone;
}
