import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

import type { Env } from '../../../config/env.validation';

/**
 * Token DI untuk verifier ID token Google.
 */
export const GOOGLE_TOKEN_VERIFIER = Symbol('GOOGLE_TOKEN_VERIFIER');

/**
 * Identitas yang diambil dari ID token Google yang sudah terverifikasi.
 */
export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

/**
 * Kontrak verifikasi ID token Google. Mengembalikan null untuk token yang tidak valid;
 * tidak melempar error agar pemanggil tidak membocorkan penyebab kegagalan.
 */
export interface GoogleTokenVerifier {
  verify(idToken: string): Promise<GoogleIdentity | null>;
}

/**
 * Subset OAuth2Client yang dipakai (agar mudah diganti pada test).
 */
export interface IdTokenClient {
  verifyIdToken(options: { idToken: string; audience: string }): Promise<{
    getPayload():
      | {
          email?: string;
          email_verified?: boolean;
          name?: string;
          picture?: string;
        }
      | undefined;
  }>;
}

/**
 * Verifier produksi: memeriksa tanda tangan Google, masa berlaku, issuer, dan audience (GOOGLE_CLIENT_ID).
 */
export class GoogleAuthLibraryVerifier implements GoogleTokenVerifier {
  private readonly logger = new Logger(GoogleAuthLibraryVerifier.name);

  /**
   * @param clientId - Google OAuth client ID aplikasi (audience yang harus cocok).
   * @param client - Client verifikasi (default OAuth2Client dari google-auth-library).
   */
  constructor(
    private readonly clientId: string,
    private readonly client: IdTokenClient = new OAuth2Client(clientId),
  ) {}

  /**
   * @param idToken - ID token dari Google Sign-In di frontend.
   * @returns Identitas Google, atau null bila token tidak valid.
   */
  async verify(idToken: string): Promise<GoogleIdentity | null> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.email) {
        return null;
      }
      return {
        email: payload.email.toLowerCase(),
        emailVerified: payload.email_verified === true,
        name: payload.name,
        picture: payload.picture,
      };
    } catch (error) {
      this.logger.debug(
        `Google ID token rejected: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }
}

/**
 * Verifier untuk environment tanpa GOOGLE_CLIENT_ID (development): menolak semua token.
 * Sengaja TIDAK menerima token apa pun agar tidak ada jalur login palsu.
 */
export class UnconfiguredGoogleVerifier implements GoogleTokenVerifier {
  private readonly logger = new Logger(UnconfiguredGoogleVerifier.name);

  /**
   * @returns Selalu null.
   */
  verify(): Promise<GoogleIdentity | null> {
    this.logger.warn(
      'Google login attempted but GOOGLE_CLIENT_ID is not configured; rejecting',
    );
    return Promise.resolve(null);
  }
}

/**
 * Membuat verifier sesuai konfigurasi. Tanpa GOOGLE_CLIENT_ID: menolak semua token di development/test,
 * dan gagal saat startup di staging/production.
 *
 * @param config - Konfigurasi aplikasi.
 * @returns Verifier ID token Google.
 * @throws Error bila GOOGLE_CLIENT_ID kosong di staging/production.
 */
export function createGoogleTokenVerifier(
  config: ConfigService<Env, true>,
): GoogleTokenVerifier {
  const clientId = config.get('GOOGLE_CLIENT_ID', { infer: true });
  if (clientId) {
    return new GoogleAuthLibraryVerifier(clientId);
  }
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  if (nodeEnv === 'development' || nodeEnv === 'test') {
    return new UnconfiguredGoogleVerifier();
  }
  throw new Error('GOOGLE_CLIENT_ID is required outside development');
}
