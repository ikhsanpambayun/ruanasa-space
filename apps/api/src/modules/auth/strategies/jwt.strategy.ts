import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';

import type { Env } from '../../../config/env.validation';
import { UsersRepository } from '../../users/users.repository';
import { extractToken } from '../auth-token.util';
import type { AccessTokenPayload, AuthenticatedUser } from '../auth.types';
import { TokenService } from '../token.service';

/**
 * Strategy passport untuk JWT akses. Token dibaca dari cookie lebih dulu, lalu header Bearer.
 * Hanya HS256 yang diterima; token kedaluwarsa, di-blacklist, atau milik user yang sudah tidak ada ditolak.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  /**
   * @param config - Konfigurasi aplikasi (JWT_SECRET).
   * @param users - Repository user untuk memastikan akun masih aktif.
   * @param tokens - Pemeriksa blacklist.
   */
  constructor(
    config: ConfigService<Env, true>,
    private readonly users: UsersRepository,
    private readonly tokens: TokenService,
  ) {
    super({
      jwtFromRequest: extractToken,
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
      algorithms: ['HS256'],
      passReqToCallback: true,
    });
  }

  /**
   * Dipanggil passport setelah tanda tangan dan masa berlaku token valid.
   *
   * @param req - Request (untuk membaca token mentah).
   * @param payload - Payload JWT.
   * @returns User terautentikasi yang akan dipasang di `req.user`.
   * @throws UnauthorizedException bila token bukan token akses, di-blacklist, atau akun tidak aktif.
   */
  async validate(
    req: Request,
    payload: AccessTokenPayload,
  ): Promise<AuthenticatedUser> {
    // temp_token tidak memiliki sub/role sehingga ditolak di sini.
    const hasValidShape =
      typeof payload.sub === 'string' &&
      (payload.role === 'admin' || payload.role === 'participant');
    if (!hasValidShape) {
      throw new UnauthorizedException();
    }

    const token = extractToken(req);
    if (!token || this.tokens.isBlacklisted(token)) {
      throw new UnauthorizedException();
    }

    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return { id: user.id, role: user.role };
  }
}
