import { SetMetadata } from '@nestjs/common';

/**
 * Kunci metadata penanda endpoint publik (tanpa autentikasi).
 */
export const IS_PUBLIC_KEY = 'is_public';

/**
 * Menandai route atau controller sebagai publik. Semua endpoint lain dilindungi JwtAuthGuard
 * secara default (secure by default), sehingga endpoint baru tidak terbuka tanpa disengaja.
 *
 * @returns Dekorator method/class.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
