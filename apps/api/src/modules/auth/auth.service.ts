import { Injectable } from '@nestjs/common';

import { TokenService } from './token.service';

/**
 * Logika autentikasi. Metode login (admin, auto-create, OTP, Google) ditambahkan bertahap
 * sesuai task P2-BE-003 sampai P2-BE-007.
 */
@Injectable()
export class AuthService {
  /**
   * @param tokens - Penerbit dan pemeriksa token.
   */
  constructor(private readonly tokens: TokenService) {}

  /**
   * Menonaktifkan token (blacklist sampai kedaluwarsa).
   *
   * @param token - JWT akses yang dipakai pada request logout.
   */
  logout(token: string): void {
    this.tokens.blacklistToken(token);
  }
}
