import { randomBytes } from 'node:crypto';

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { AuthProvider, User } from '@prisma/client';
import { compare, hash } from 'bcryptjs';

import { ERROR_CODES } from '../../common/constants/error-codes';
import { BCRYPT_ROUNDS } from '../../common/constants/security';
import { AppException } from '../../common/exceptions/app.exception';
import {
  UserUniqueViolationError,
  UsersRepository,
  type CreateUserData,
} from '../users/users.repository';
import type { IssuedToken } from './auth.types';
import { TokenService } from './token.service';

const PHONE_EXISTS_MESSAGE =
  'Nomor telepon ini sudah terdaftar, silakan login untuk melanjutkan';
const EMAIL_EXISTS_MESSAGE =
  'Email ini sudah terdaftar, silakan login untuk melanjutkan';

/**
 * Logika autentikasi. Metode login lain (OTP, Google) ditambahkan bertahap sesuai task P2-BE-003 s.d. P2-BE-005.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash: Promise<string> | null = null;

  /**
   * @param tokens - Penerbit dan pemeriksa token.
   * @param users - Repository user.
   */
  constructor(
    private readonly tokens: TokenService,
    private readonly users: UsersRepository,
  ) {}

  /**
   * Menonaktifkan token (blacklist sampai kedaluwarsa).
   *
   * @param token - JWT akses yang dipakai pada request logout.
   */
  logout(token: string): void {
    this.tokens.blacklistToken(token);
  }

  /**
   * Menerbitkan token akses untuk user.
   *
   * @param user - User yang berhasil login.
   * @returns Token dan waktu kedaluwarsanya.
   */
  issueSession(user: User): IssuedToken {
    return this.tokens.signAccessToken({ id: user.id, role: user.role });
  }

  /**
   * Login admin dengan email dan password (P2-BE-007). Semua kegagalan menghasilkan error yang sama
   * (email tidak ada, bukan admin, atau password salah) dan durasi yang kurang lebih sama,
   * sehingga keberadaan email admin tidak dapat ditebak.
   *
   * @param email - Email admin (sudah lowercase).
   * @param password - Password admin.
   * @returns User admin yang berhasil login.
   * @throws AppException 401 AUTH_FAILED bila kredensial salah.
   */
  async adminLogin(email: string, password: string): Promise<User> {
    const user = await this.users.findByEmail(email);
    const isAdminWithPassword = user?.role === 'admin' && !!user.passwordHash;
    const hashToCompare =
      isAdminWithPassword && user.passwordHash
        ? user.passwordHash
        : await this.getDummyHash();

    const passwordMatches = await compare(password, hashToCompare);
    if (!user || !isAdminWithPassword || !passwordMatches) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.AUTH_FAILED,
        'Email atau password salah',
      );
    }
    return user;
  }

  /**
   * Membuat akun otomatis tanpa login (P2-BE-006). Nomor telepon (primary) dicek lebih dulu, lalu email.
   *
   * @param name - Nama user.
   * @param phoneNumber - Nomor telepon kanonik.
   * @param email - Email lowercase.
   * @returns User baru dengan auth_provider `auto_created`.
   * @throws AppException 409 PHONE_ALREADY_EXISTS atau EMAIL_ALREADY_EXISTS.
   */
  async autoCreate(
    name: string,
    phoneNumber: string,
    email: string,
  ): Promise<User> {
    if (await this.users.findByPhone(phoneNumber)) {
      throw this.phoneExists();
    }
    if (await this.users.findByEmail(email)) {
      throw this.emailExists();
    }
    return this.createUser({
      name,
      phoneNumber,
      email,
      authProvider: 'auto_created',
    });
  }

  /**
   * Membuat user baru dan menerjemahkan pelanggaran unique (balapan antar request) menjadi error 409.
   *
   * @param data - Data user.
   * @returns User yang dibuat.
   * @throws AppException 409 bila phone/email sudah dipakai.
   */
  protected async createUser(data: CreateUserData): Promise<User> {
    try {
      return await this.users.create(data);
    } catch (error) {
      if (error instanceof UserUniqueViolationError) {
        throw error.field === 'email' ? this.emailExists() : this.phoneExists();
      }
      throw error;
    }
  }

  /**
   * Login user peserta yang sudah ada lewat jalur tanpa password (OTP, Google). Akun admin tidak boleh
   * masuk lewat jalur ini karena akan melewati password. Auth provider diperbarui ke metode terbaru
   * (account linking).
   *
   * @param user - User yang identitasnya sudah terverifikasi.
   * @param provider - Metode login yang dipakai.
   * @returns User setelah auth_provider diperbarui.
   * @throws AppException 401 AUTH_FAILED bila user adalah admin.
   */
  protected async loginParticipant(
    user: User,
    provider: AuthProvider,
  ): Promise<User> {
    if (user.role === 'admin') {
      this.logger.warn(
        `Passwordless login attempt rejected for admin account ${user.id}`,
      );
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.AUTH_FAILED,
        'Akun ini tidak dapat masuk dengan metode tersebut',
      );
    }
    return user.authProvider === provider
      ? user
      : this.users.updateAuthProvider(user.id, provider);
  }

  protected phoneExists(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      ERROR_CODES.PHONE_ALREADY_EXISTS,
      PHONE_EXISTS_MESSAGE,
    );
  }

  protected emailExists(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      ERROR_CODES.EMAIL_ALREADY_EXISTS,
      EMAIL_EXISTS_MESSAGE,
    );
  }

  /**
   * Hash bcrypt acak (dibuat sekali) untuk membandingkan password saat email tidak ditemukan,
   * agar waktu respons tidak membedakan email yang ada dan tidak.
   */
  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hash(randomBytes(16).toString('hex'), BCRYPT_ROUNDS);
    return this.dummyHash;
  }
}
