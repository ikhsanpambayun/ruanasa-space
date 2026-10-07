import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest, AuthenticatedUser } from '../auth.types';

/**
 * Mengambil user terautentikasi dari request: `@CurrentUser() user` atau `@CurrentUser('id') id`.
 *
 * @param field - Nama properti yang diambil (opsional); tanpa argumen mengembalikan seluruh objek user.
 * @param context - Konteks eksekusi.
 * @returns Objek user, nilai propertinya, atau undefined pada endpoint publik.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    return field && user ? user[field] : user;
  },
);
