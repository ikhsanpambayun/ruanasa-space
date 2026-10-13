const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86_400,
};

/**
 * Pola durasi yang didukung: angka diikuti satuan s/m/h/d (contoh: 15m, 7d).
 */
export const DURATION_PATTERN = /^\d+[smhd]$/;

/**
 * Mengubah string durasi (contoh `7d`) menjadi jumlah detik.
 *
 * @param value - Durasi dengan format DURATION_PATTERN.
 * @returns Jumlah detik.
 * @throws Error bila format tidak dikenali.
 */
export function parseDurationToSeconds(value: string): number {
  if (!DURATION_PATTERN.test(value)) {
    throw new Error(
      `Invalid duration "${value}", expected format like 15m or 7d`,
    );
  }
  const amount = Number(value.slice(0, -1));
  const unit = value.slice(-1);
  return amount * (UNIT_SECONDS[unit] ?? 0);
}
