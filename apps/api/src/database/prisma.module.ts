import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Modul global penyedia PrismaService, dapat di-inject di module mana pun tanpa import ulang.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
