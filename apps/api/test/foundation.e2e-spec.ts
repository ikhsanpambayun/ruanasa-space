import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  type INestApplication,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { ERROR_CODES } from '../src/common/constants/error-codes';
import { AuthRateLimit } from '../src/common/decorators/rate-limit.decorator';
import { ResponseMessage } from '../src/common/decorators/response-message.decorator';
import { PaginatedResult } from '../src/common/dto/paginated-result';
import { AppException } from '../src/common/exceptions/app.exception';
import { setupApp } from '../src/setup-app';
import { bodyOf } from './test-env';

class ProbeDto {
  @IsString()
  @IsNotEmpty({ message: 'Nama wajib diisi' })
  name!: string;

  @IsInt({ message: 'Umur harus berupa angka bulat' })
  age!: number;
}

@Controller('probe')
class ProbeController {
  @Get('auth')
  @AuthRateLimit()
  auth(): { ok: boolean } {
    return { ok: true };
  }

  @Post('validate')
  validate(@Body() dto: ProbeDto): ProbeDto {
    return dto;
  }

  @Get('business-error')
  businessError(): never {
    throw new AppException(
      HttpStatus.CONFLICT,
      ERROR_CODES.DUPLICATE_REGISTRATION,
      'Sudah terdaftar di event ini',
    );
  }

  @Get('crash')
  crash(): never {
    throw new Error('database password leaked: hunter2');
  }

  @Get('list')
  @ResponseMessage('Daftar berhasil dimuat')
  list(): PaginatedResult<{ id: number }> {
    return new PaginatedResult([{ id: 1 }], {
      page: 1,
      per_page: 20,
      total_items: 1,
    });
  }

  @Get('empty')
  empty(): void {
    return undefined;
  }
}

describe('Global pipeline (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    const nestApp =
      moduleFixture.createNestApplication<NestExpressApplication>();
    setupApp(nestApp);
    await nestApp.init();
    app = nestApp;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 with RATE_LIMITED on the 11th request to an auth-limited endpoint', async () => {
    for (let i = 1; i <= 10; i += 1) {
      await request(app.getHttpServer()).get('/api/v1/probe/auth').expect(200);
    }

    const res = await request(app.getHttpServer())
      .get('/api/v1/probe/auth')
      .expect(429);

    expect(res.body).toEqual({
      success: false,
      message: 'Terlalu banyak request. Coba lagi beberapa saat.',
      error_code: 'RATE_LIMITED',
    });
  });

  it('formats DTO validation failures as VALIDATION_ERROR with per-field errors', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe/validate')
      .send({ name: '', age: 'abc' })
      .expect(400);

    expect(res.body).toMatchObject({
      success: false,
      message: 'Input tidak valid',
      error_code: 'VALIDATION_ERROR',
    });
    const body = bodyOf(res);
    expect(body.errors?.name).toContain('Nama wajib diisi');
    expect(body.errors?.age).toContain('Umur harus berupa angka bulat');
  });

  it('rejects unknown fields in the request body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe/validate')
      .send({ name: 'Ayu', age: 30, role: 'admin' })
      .expect(400);

    const body = bodyOf(res);
    expect(body.error_code).toBe('VALIDATION_ERROR');
    expect(body.errors?.role).toBeDefined();
  });

  it('passes through AppException with its own error_code and message', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/probe/business-error')
      .expect(409);

    expect(res.body).toEqual({
      success: false,
      message: 'Sudah terdaftar di event ini',
      error_code: 'DUPLICATE_REGISTRATION',
    });
  });

  it('hides internal error details behind INTERNAL_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/probe/crash')
      .expect(500);

    expect(res.body).toEqual({
      success: false,
      message: 'Terjadi kesalahan pada server',
      error_code: 'INTERNAL_ERROR',
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  it('puts pagination at the top level and uses @ResponseMessage', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/probe/list')
      .expect(200);

    expect(res.body).toEqual({
      success: true,
      message: 'Daftar berhasil dimuat',
      data: [{ id: 1 }],
      pagination: { page: 1, per_page: 20, total_items: 1 },
    });
    expect(bodyOf(res).pagination?.total_pages).toBeUndefined();
  });

  it('wraps an empty handler result as data: null', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/probe/empty');

    expect(res.body).toEqual({ success: true, message: 'Success', data: null });
  });
});
