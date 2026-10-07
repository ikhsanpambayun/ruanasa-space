import { z } from 'zod';

/**
 * Skema environment variables backend (TAD v1.6 Section 21.2).
 * Variabel layanan eksternal (Google, Midtrans, WhatsApp, Email, Supabase) opsional sampai modul
 * yang memakainya dikerjakan; setelah itu dijadikan wajib di skema ini.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'staging', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  APP_URL: z.string().url().default('http://localhost:3000'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL wajib diisi'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET minimal 32 karakter (256-bit)'),
  JWT_EXPIRY: z.string().min(1).default('7d'),

  CORS_ORIGINS: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  MIDTRANS_SERVER_KEY: z.string().optional(),
  MIDTRANS_CLIENT_KEY: z.string().optional(),
  MIDTRANS_IS_PRODUCTION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  MIDTRANS_WEBHOOK_URL: z.string().optional(),

  WHATSAPP_PROVIDER: z.enum(['fonnte', 'wablas']).optional(),
  WHATSAPP_API_URL: z.string().optional(),
  WHATSAPP_API_KEY: z.string().optional(),
  WHATSAPP_SENDER_NUMBER: z.string().optional(),

  EMAIL_PROVIDER: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().optional(),
  EMAIL_FROM_NAME: z.string().optional(),

  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().optional(),
});

/**
 * Environment backend yang sudah tervalidasi. `corsOrigins` adalah hasil parsing CORS_ORIGINS.
 */
export type Env = z.infer<typeof envSchema> & { corsOrigins: string[] };

const DEV_CORS_ORIGINS: string[] = ['http://localhost:3000'];

/**
 * Memvalidasi environment variables saat startup. Dipakai sebagai `validate` pada ConfigModule.
 * Variabel wajib yang kosong menyebabkan error sehingga aplikasi gagal start.
 *
 * @param config - Isi process.env (dan file .env) sebelum divalidasi.
 * @returns Environment yang sudah dikonversi tipenya.
 * @throws Error berisi daftar variabel yang tidak valid.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  // `KEY=` kosong di file .env dianggap tidak diisi (variabel wajib tetap gagal, opsional di-skip).
  const provided = Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== ''),
  );
  const result = envSchema.safeParse(provided);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const env = result.data;
  const isLocal = env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
  const rawOrigins = env.CORS_ORIGINS?.trim();

  if (!rawOrigins && !isLocal) {
    throw new Error(
      'Invalid environment configuration:\n- CORS_ORIGINS: required outside development',
    );
  }

  const corsOrigins = rawOrigins
    ? rawOrigins
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
    : DEV_CORS_ORIGINS;

  return { ...env, corsOrigins };
}
