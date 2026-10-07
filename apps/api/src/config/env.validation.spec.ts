import { validateEnv } from './env.validation';

const validEnv: Record<string, string> = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  DIRECT_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a-very-long-secret-with-at-least-32-chars',
};

describe('validateEnv', () => {
  it('accepts a valid environment and applies defaults', () => {
    const env = validateEnv(validEnv);

    expect(env.PORT).toBe(3001);
    expect(env.JWT_EXPIRY).toBe('7d');
    expect(env.MIDTRANS_IS_PRODUCTION).toBe(false);
    expect(env.corsOrigins).toEqual(['http://localhost:3000']);
  });

  it.each(['DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET'])(
    'fails when %s is missing',
    (key) => {
      const rest = Object.fromEntries(
        Object.entries(validEnv).filter(([name]) => name !== key),
      );

      expect(() => validateEnv(rest)).toThrow(key);
    },
  );

  it('treats empty optional values as not provided', () => {
    const env = validateEnv({
      ...validEnv,
      WHATSAPP_PROVIDER: '',
      MIDTRANS_SERVER_KEY: '',
    });

    expect(env.WHATSAPP_PROVIDER).toBeUndefined();
    expect(env.MIDTRANS_SERVER_KEY).toBeUndefined();
  });

  it('fails when a required value is present but empty', () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: '' })).toThrow(
      'JWT_SECRET',
    );
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: 'too-short' })).toThrow(
      'JWT_SECRET',
    );
  });

  it('parses CORS_ORIGINS into a trimmed list', () => {
    const env = validateEnv({
      ...validEnv,
      CORS_ORIGINS: ' https://ruanasaspace.com , https://www.ruanasaspace.com ',
    });

    expect(env.corsOrigins).toEqual([
      'https://ruanasaspace.com',
      'https://www.ruanasaspace.com',
    ]);
  });

  it('requires CORS_ORIGINS in production', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'production' })).toThrow(
      'CORS_ORIGINS',
    );
  });
});
