import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  Test,
  type TestingModule,
  type TestingModuleBuilder,
} from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';
import { UsersRepository } from '../../src/modules/users/users.repository';
import { setupApp } from '../../src/setup-app';
import { FakeUsersRepository } from './fake-users.repository';

export interface TestApp {
  app: NestExpressApplication;
  module: TestingModule;
  users: FakeUsersRepository;
}

export interface TestAppOptions {
  /** Controller tambahan khusus test (probe). */
  controllers?: Type<unknown>[];
  /** Hook untuk meng-override provider tambahan. */
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/**
 * Membuat aplikasi NestJS lengkap (pipeline global yang sama dengan produksi) tanpa database:
 * PrismaService diganti stub dan UsersRepository diganti FakeUsersRepository.
 *
 * @param options - Controller probe dan override tambahan.
 * @returns App yang sudah diinisialisasi, module, dan repository user palsu.
 */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<TestApp> {
  const users = new FakeUsersRepository();

  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(UsersRepository)
    .useValue(users);

  if (options.configure) {
    builder = options.configure(builder);
  }

  const module = await builder.compile();
  const app = module.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();
  return { app, module, users };
}
