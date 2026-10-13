import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  Test,
  type TestingModule,
  type TestingModuleBuilder,
} from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';
import { TokenService } from '../../src/modules/auth/token.service';
import { UsersRepository } from '../../src/modules/users/users.repository';
import { setupApp } from '../../src/setup-app';
import { FakeUsersRepository } from './fake-users.repository';

export type AuthHeader = { Authorization: string };

export interface TestApp {
  app: NestExpressApplication;
  module: TestingModule;
  users: FakeUsersRepository;
  /** Membuat user admin di repository palsu dan mengembalikan header Bearer-nya. */
  asAdmin: () => AuthHeader;
  /** Membuat user participant di repository palsu dan mengembalikan header Bearer-nya. */
  asParticipant: (
    overrides?: Parameters<FakeUsersRepository['add']>[0],
  ) => AuthHeader;
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
 * @returns App yang sudah diinisialisasi, module, repository user palsu, dan helper autentikasi.
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

  const tokens = module.get(TokenService);
  const headerFor = (
    id: string,
    role: 'admin' | 'participant',
  ): AuthHeader => ({
    Authorization: `Bearer ${tokens.signAccessToken({ id, role }).token}`,
  });

  return {
    app,
    module,
    users,
    asAdmin: () => headerFor(users.add({ role: 'admin' }).id, 'admin'),
    asParticipant: (overrides = {}) =>
      headerFor(
        users.add({ role: 'participant', ...overrides }).id,
        'participant',
      ),
  };
}
