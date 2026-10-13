import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../../config/env.validation';
import {
  ConsoleEmailAdapter,
  ResendEmailAdapter,
  type FetchFunction,
} from './email.adapter';
import {
  createEmailProvider,
  createWhatsAppProvider,
} from './provider.factories';
import { ConsoleWhatsAppAdapter, FonnteAdapter } from './whatsapp.adapter';

/**
 * Membuat fetch palsu yang menyimpan request terakhir.
 *
 * @param response - Response yang dikembalikan.
 * @returns Fungsi fetch dan akses ke request yang tercatat.
 */
function fakeFetch(response: Response | Error): {
  fn: FetchFunction;
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn: FetchFunction = (url, init) => {
    calls.push({ url, init });
    return response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response);
  };
  return { fn, calls };
}

/**
 * Membuat ConfigService palsu dari map nilai.
 *
 * @param values - Nilai konfigurasi.
 * @returns ConfigService tiruan.
 */
function configOf(
  values: Partial<Record<keyof Env, unknown>>,
): ConfigService<Env, true> {
  return { get: (key: keyof Env) => values[key] } as unknown as ConfigService<
    Env,
    true
  >;
}

describe('ResendEmailAdapter', () => {
  const message = {
    to: 'budi@example.com',
    subject: 'Kode OTP',
    text: 'Kode: 123456',
  };

  it('posts to the Resend API with a Bearer key and a "Name <address>" sender', async () => {
    const { fn, calls } = fakeFetch(new Response('{}', { status: 200 }));
    const adapter = new ResendEmailAdapter(
      're_test_key',
      'noreply@ruanasaspace.com',
      'Ruanasa Space',
      fn,
    );

    const result = await adapter.send(message);

    expect(result).toEqual({ success: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    expect(calls[0]?.init.method).toBe('POST');
    expect(
      (calls[0]?.init.headers as Record<string, string>).Authorization,
    ).toBe('Bearer re_test_key');
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      from: 'Ruanasa Space <noreply@ruanasaspace.com>',
      to: ['budi@example.com'],
      subject: 'Kode OTP',
      text: 'Kode: 123456',
    });
  });

  it('reports failure (without throwing) when Resend rejects the request', async () => {
    const { fn } = fakeFetch(new Response('{}', { status: 422 }));
    const adapter = new ResendEmailAdapter('k', 'a@b.com', 'N', fn);

    await expect(adapter.send(message)).resolves.toEqual({
      success: false,
      error: 'Resend HTTP 422',
    });
  });

  it('reports failure (without throwing) on a network error', async () => {
    const { fn } = fakeFetch(new Error('socket hang up'));
    const adapter = new ResendEmailAdapter('k', 'a@b.com', 'N', fn);

    await expect(adapter.send(message)).resolves.toEqual({
      success: false,
      error: 'socket hang up',
    });
  });
});

describe('FonnteAdapter', () => {
  it('posts to {apiUrl}/send with the raw token and an international number', async () => {
    const { fn, calls } = fakeFetch(
      new Response(JSON.stringify({ status: true }), { status: 200 }),
    );
    const adapter = new FonnteAdapter(
      'https://api.fonnte.com/',
      'fonnte-token',
      fn,
    );

    const result = await adapter.sendMessage('081234567890', 'Kode OTP 123456');

    expect(result).toEqual({ success: true });
    expect(calls[0]?.url).toBe('https://api.fonnte.com/send');
    expect(
      (calls[0]?.init.headers as Record<string, string>).Authorization,
    ).toBe('fonnte-token');
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      target: '6281234567890',
      message: 'Kode OTP 123456',
    });
  });

  it('treats HTTP 200 with { status: false } as a failure', async () => {
    const { fn } = fakeFetch(
      new Response(JSON.stringify({ status: false, reason: 'token invalid' }), {
        status: 200,
      }),
    );
    const adapter = new FonnteAdapter('https://api.fonnte.com', 'bad', fn);

    await expect(adapter.sendMessage('081234567890', 'x')).resolves.toEqual({
      success: false,
      error: 'token invalid',
    });
  });

  it('reports failure on non-2xx responses and network errors', async () => {
    const http = new FonnteAdapter(
      'https://api.fonnte.com',
      'k',
      fakeFetch(new Response('', { status: 500 })).fn,
    );
    const network = new FonnteAdapter(
      'https://api.fonnte.com',
      'k',
      fakeFetch(new Error('ECONNRESET')).fn,
    );

    await expect(http.sendMessage('081234567890', 'x')).resolves.toMatchObject({
      success: false,
    });
    await expect(network.sendMessage('081234567890', 'x')).resolves.toEqual({
      success: false,
      error: 'ECONNRESET',
    });
  });
});

describe('provider factories', () => {
  it.each(['development', 'test'])(
    'falls back to console adapters without credentials in %s',
    (nodeEnv) => {
      const config = configOf({ NODE_ENV: nodeEnv });

      expect(createEmailProvider(config)).toBeInstanceOf(ConsoleEmailAdapter);
      expect(createWhatsAppProvider(config)).toBeInstanceOf(
        ConsoleWhatsAppAdapter,
      );
    },
  );

  it.each(['staging', 'production'])(
    'refuses to start without credentials in %s (never silently skip OTP)',
    (nodeEnv) => {
      const config = configOf({ NODE_ENV: nodeEnv });

      expect(() => createEmailProvider(config)).toThrow('EMAIL_API_KEY');
      expect(() => createWhatsAppProvider(config)).toThrow('WHATSAPP_API_KEY');
    },
  );

  it('builds the real adapters when credentials are present', () => {
    const config = configOf({
      NODE_ENV: 'production',
      EMAIL_PROVIDER: 'resend',
      EMAIL_API_KEY: 're_x',
      EMAIL_FROM_ADDRESS: 'noreply@ruanasaspace.com',
      WHATSAPP_PROVIDER: 'fonnte',
      WHATSAPP_API_KEY: 'fonnte-x',
    });

    expect(createEmailProvider(config)).toBeInstanceOf(ResendEmailAdapter);
    expect(createWhatsAppProvider(config)).toBeInstanceOf(FonnteAdapter);
  });

  it('rejects unsupported providers instead of silently ignoring them', () => {
    expect(() =>
      createEmailProvider(
        configOf({
          NODE_ENV: 'production',
          EMAIL_PROVIDER: 'sendgrid',
          EMAIL_API_KEY: 'k',
          EMAIL_FROM_ADDRESS: 'a@b.com',
        }),
      ),
    ).toThrow('Unsupported EMAIL_PROVIDER');
    expect(() =>
      createWhatsAppProvider(
        configOf({
          NODE_ENV: 'production',
          WHATSAPP_PROVIDER: 'wablas',
          WHATSAPP_API_KEY: 'k',
        }),
      ),
    ).toThrow('wablas');
  });
});
