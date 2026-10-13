import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../../config/env.validation';
import {
  createGoogleTokenVerifier,
  GoogleAuthLibraryVerifier,
  UnconfiguredGoogleVerifier,
  type IdTokenClient,
} from './google-token.verifier';

const CLIENT_ID = '1234567890-abc.apps.googleusercontent.com';

/**
 * Membuat client verifikasi palsu.
 *
 * @param behaviour - Payload yang dikembalikan, atau Error yang dilempar.
 * @returns Client palsu dan daftar opsi yang diterimanya.
 */
function fakeClient(behaviour: Record<string, unknown> | undefined | Error): {
  client: IdTokenClient;
  calls: { idToken: string; audience: string }[];
} {
  const calls: { idToken: string; audience: string }[] = [];
  const client: IdTokenClient = {
    verifyIdToken: (options) => {
      calls.push(options);
      if (behaviour instanceof Error) {
        return Promise.reject(behaviour);
      }
      return Promise.resolve({ getPayload: () => behaviour });
    },
  };
  return { client, calls };
}

describe('GoogleAuthLibraryVerifier', () => {
  it('verifies against the configured client id (audience) and maps the payload', async () => {
    const { client, calls } = fakeClient({
      email: 'Gina@Example.COM',
      email_verified: true,
      name: 'Gina',
      picture: 'https://example.com/p.png',
    });

    const identity = await new GoogleAuthLibraryVerifier(
      CLIENT_ID,
      client,
    ).verify('id-token');

    expect(calls).toEqual([{ idToken: 'id-token', audience: CLIENT_ID }]);
    expect(identity).toEqual({
      email: 'gina@example.com',
      emailVerified: true,
      name: 'Gina',
      picture: 'https://example.com/p.png',
    });
  });

  it('treats a missing email_verified claim as unverified', async () => {
    const { client } = fakeClient({ email: 'a@example.com' });

    await expect(
      new GoogleAuthLibraryVerifier(CLIENT_ID, client).verify('t'),
    ).resolves.toMatchObject({
      emailVerified: false,
    });
  });

  it('returns null (never throws) when the library rejects the token', async () => {
    const { client } = fakeClient(
      new Error('Wrong recipient, payload audience != requiredAudience'),
    );

    await expect(
      new GoogleAuthLibraryVerifier(CLIENT_ID, client).verify('t'),
    ).resolves.toBeNull();
  });

  it('returns null when the payload has no email', async () => {
    const { client } = fakeClient({ name: 'Tanpa Email' });

    await expect(
      new GoogleAuthLibraryVerifier(CLIENT_ID, client).verify('t'),
    ).resolves.toBeNull();
  });

  it('returns null when the library returns no payload', async () => {
    const { client } = fakeClient(undefined);

    await expect(
      new GoogleAuthLibraryVerifier(CLIENT_ID, client).verify('t'),
    ).resolves.toBeNull();
  });
});

describe('createGoogleTokenVerifier', () => {
  const configOf = (
    values: Partial<Record<keyof Env, unknown>>,
  ): ConfigService<Env, true> =>
    ({ get: (key: keyof Env) => values[key] }) as unknown as ConfigService<
      Env,
      true
    >;

  it('uses the real verifier when GOOGLE_CLIENT_ID is set', () => {
    expect(
      createGoogleTokenVerifier(
        configOf({ NODE_ENV: 'production', GOOGLE_CLIENT_ID: CLIENT_ID }),
      ),
    ).toBeInstanceOf(GoogleAuthLibraryVerifier);
  });

  it('rejects every token in development when GOOGLE_CLIENT_ID is missing (no fake login path)', async () => {
    const verifier = createGoogleTokenVerifier(
      configOf({ NODE_ENV: 'development' }),
    );

    expect(verifier).toBeInstanceOf(UnconfiguredGoogleVerifier);
    await expect(verifier.verify('any-token-at-all')).resolves.toBeNull();
  });

  it.each(['staging', 'production'])(
    'refuses to start in %s without GOOGLE_CLIENT_ID',
    (nodeEnv) => {
      expect(() =>
        createGoogleTokenVerifier(configOf({ NODE_ENV: nodeEnv })),
      ).toThrow('GOOGLE_CLIENT_ID');
    },
  );
});
