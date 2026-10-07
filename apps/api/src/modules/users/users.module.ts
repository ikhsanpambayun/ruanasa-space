import { Module } from '@nestjs/common';

import { UsersRepository } from './users.repository';

/**
 * Modul users. Controller dan service profil ditambahkan di P3-BE-001.
 */
@Module({
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
