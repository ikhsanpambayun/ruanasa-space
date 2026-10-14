/** Selisih WIB (Asia/Jakarta, UTC+7) terhadap UTC dalam milidetik. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Tanggal hari ini menurut WIB dalam format YYYY-MM-DD. Dipakai untuk aturan berbasis tanggal
 * (kedaluwarsa promo, event mendatang) karena data disimpan UTC tetapi bisnis berjalan di WIB.
 *
 * @param now - Waktu acuan (default sekarang).
 * @returns Tanggal WIB, contoh `2026-10-13`.
 */
export function todayInWib(now: Date = new Date()): string {
  return new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Mengubah nilai kolom DATE (Date UTC tengah malam) menjadi string YYYY-MM-DD.
 *
 * @param date - Nilai dari database, atau null.
 * @returns String tanggal, atau null.
 */
export function formatDateOnly(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/**
 * Mengubah string YYYY-MM-DD menjadi Date UTC tengah malam untuk kolom DATE.
 *
 * @param value - Tanggal berformat YYYY-MM-DD yang sudah divalidasi.
 * @returns Date UTC.
 */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Memeriksa string YYYY-MM-DD adalah tanggal kalender yang valid (menolak 2026-02-31).
 *
 * @param value - String yang diperiksa.
 * @returns True bila format dan tanggalnya valid.
 */
export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = parseDateOnly(value);
  return !Number.isNaN(parsed.getTime()) && formatDateOnly(parsed) === value;
}

/**
 * Format ISO 8601 dengan offset WIB, sesuai contoh API Spec (`2027-03-15T08:00:00+07:00`).
 *
 * @param date - Waktu (instant) dari database.
 * @returns String ISO 8601 dengan offset +07:00.
 */
export function toWibIsoString(date: Date): string {
  return new Date(date.getTime() + WIB_OFFSET_MS)
    .toISOString()
    .replace(/\.\d{3}Z$/, '+07:00');
}

/** Pola jam 24 jam berformat HH:mm. */
export const TIME_ONLY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Mengubah nilai kolom TIME (Date 1970-01-01 UTC) menjadi string HH:mm. Jam event disimpan sebagai
 * waktu dinding WIB tanpa konversi zona waktu.
 *
 * @param time - Nilai dari database, atau null.
 * @returns String HH:mm, atau null.
 */
export function formatTimeOnly(time: Date | null): string | null {
  return time ? time.toISOString().slice(11, 16) : null;
}

/**
 * Mengubah string HH:mm menjadi Date 1970-01-01 UTC untuk kolom TIME.
 *
 * @param value - Jam berformat HH:mm yang sudah divalidasi.
 * @returns Date UTC.
 */
export function parseTimeOnly(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}
