import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';

import { ERROR_CODES } from '../../../common/constants/error-codes';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedRequest } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Guard role global. Berjalan setelah JwtAuthGuard: endpoint dengan @Roles hanya untuk role yang tercantum,
 * endpoint tanpa @Roles terbuka untuk semua user yang sudah login.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  /**
   * @param reflector - Untuk membaca metadata @Roles().
   */
  constructor(private readonly reflector: Reflector) {}

  /**
   * @param context - Konteks eksekusi.
   * @returns True bila role user diizinkan.
   * @throws AppException 403 FORBIDDEN bila role tidak sesuai.
   */
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || !required.includes(user.role)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.FORBIDDEN,
        'Tidak memiliki akses',
      );
    }
    return true;
  }
}
