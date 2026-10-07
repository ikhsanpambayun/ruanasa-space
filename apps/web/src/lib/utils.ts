import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Menggabungkan class Tailwind secara kondisional dan menyelesaikan konflik antar utility.
 *
 * @param inputs - Daftar class (string, objek, array, atau nilai falsy).
 * @returns String class yang sudah digabung.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
