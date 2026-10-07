import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

import { buildCorsOptions } from './config/cors.config';
import type { Env } from './config/env.validation';
import { AllExceptionFilter } from './common/filters/all-exception.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { createValidationPipe } from './common/pipes/validation.pipe';

/**
 * Base path REST API (TAD v1.6 Section 8.5).
 */
export const API_PREFIX = 'api/v1';

/**
 * Menerapkan konfigurasi global aplikasi: prefix, CORS, validation pipe, filter, dan interceptor.
 * Dipakai oleh `main.ts` dan test e2e agar perilaku keduanya identik.
 *
 * @param app - Instance aplikasi NestJS (Express).
 */
export function setupApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  if (config.get('NODE_ENV', { infer: true }) === 'production') {
    // Render berada di belakang reverse proxy; dibutuhkan agar rate limit memakai IP client asli.
    app.set('trust proxy', 1);
  }

  app.use(cookieParser());
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors(buildCorsOptions(config.get('corsOrigins', { infer: true })));
  app.useGlobalPipes(createValidationPipe());
  // Catch-all didaftarkan lebih dulu agar HttpExceptionFilter yang lebih spesifik diprioritaskan.
  app.useGlobalFilters(new AllExceptionFilter(), new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TimeoutInterceptor(),
    new TransformInterceptor(app.get(Reflector)),
  );
}
