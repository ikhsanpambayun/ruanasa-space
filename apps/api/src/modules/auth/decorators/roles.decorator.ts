import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

/**
 * Kunci metadata daftar role yang diizinkan.
 */
export const ROLES_KEY = 'roles';

/**
 * Membatasi endpoint untuk role tertentu, misalnya `@Roles('admin')`.
 * Endpoint tanpa @Roles dapat diakses semua user yang sudah login.
 *
 * @param roles - Role yang diizinkan.
 * @returns Dekorator method/class.
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
