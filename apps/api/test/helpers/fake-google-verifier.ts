import type {
  GoogleIdentity,
  GoogleTokenVerifier,
} from '../../src/modules/auth/google/google-token.verifier';

/**
 * Verifier Google palsu: token yang didaftarkan dianggap valid, selain itu ditolak (null).
 */
export class FakeGoogleVerifier implements GoogleTokenVerifier {
  private readonly identities = new Map<string, GoogleIdentity>();

  /**
   * Mendaftarkan token valid beserta identitasnya.
   *
   * @param token - ID token palsu.
   * @param identity - Identitas yang dikembalikan.
   */
  register(token: string, identity: GoogleIdentity): void {
    this.identities.set(token, identity);
  }

  verify(idToken: string): Promise<GoogleIdentity | null> {
    return Promise.resolve(this.identities.get(idToken) ?? null);
  }
}
