import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { setupApp } from '../src/setup-app';
import { bodyOf } from './test-env';

describe('App foundation (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
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

  it('GET /api/v1/health returns the standard success envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    const body = bodyOf(res);
    expect(body).toMatchObject({ success: true, message: 'OK' });
    expect(body.data?.status).toBe('ok');
    expect(typeof body.data?.timestamp).toBe('string');
    expect(typeof body.data?.uptime).toBe('number');
  });

  it('does not expose the old root route outside the /api/v1 prefix', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(404);

    expect(res.body).toMatchObject({ success: false, error_code: 'NOT_FOUND' });
  });

  it('allows the configured frontend origin with credentials', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant CORS to an unknown origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://evil.example.com')
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
