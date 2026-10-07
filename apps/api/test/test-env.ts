/**
 * Bentuk body response untuk assertion test (hindari `any` dari `res.body`).
 */
export interface TestBody {
  success: boolean;
  message: string;
  error_code?: string;
  errors?: Record<string, string[]>;
  data?: { status: string; timestamp: string; uptime: number };
  pagination?: Record<string, number>;
}

/**
 * Mengambil body response sebagai tipe yang aman.
 *
 * @param res - Response supertest.
 * @returns Body bertipe TestBody.
 */
export function bodyOf(res: { body: unknown }): TestBody {
  return res.body as TestBody;
}

/**
 * Mengatur environment variables minimal untuk test e2e agar tidak bergantung pada file .env lokal.
 * Harus dipanggil sebelum AppModule dibuat.
 */
export function applyTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3001';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.DIRECT_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
  process.env.CORS_ORIGINS = 'http://localhost:3000';
}
