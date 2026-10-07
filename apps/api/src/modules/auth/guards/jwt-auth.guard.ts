import { ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';

import { ERROR_CODES } from '../../../common/constants/error-codes';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../auth.types';

/**
 * Guard JWT global. Semua endpoint wajib login kecuali ditandai @Public().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * @param reflector - Untuk membaca metadata @Public().
   */
  constructor(private readonly reflector: Reflector) {
    super();
  }

  /**
   * @param context - Konteks eksekusi.
   * @returns True bila endpoint publik atau token valid.
   */
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  /**
   * Menyeragamkan semua kegagalan autentikasi menjadi 401 UNAUTHORIZED (tanpa membocorkan penyebabnya).
   *
   * @param err - Error dari strategy.
   * @param user - User hasil strategy, atau false.
   * @returns User terautentikasi.
   * @throws AppException 401 bila gagal.
   */
  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser | false,
  ): TUser {
    if (err || !user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED,
        'Token tidak valid atau expired',
      );
    }
    return user;
  }
}
