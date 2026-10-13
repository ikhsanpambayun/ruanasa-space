import { Module } from '@nestjs/common';

import { SpecializationsModule } from '../specializations/specializations.module';
import { InstructorsController } from './instructors.controller';
import { InstructorsRepository } from './instructors.repository';
import { InstructorsService } from './instructors.service';

/**
 * Modul instruktur (P3-BE-004). Repository diekspor untuk validasi instruktur saat membuat event dan template.
 */
@Module({
  imports: [SpecializationsModule],
  controllers: [InstructorsController],
  providers: [InstructorsService, InstructorsRepository],
  exports: [InstructorsRepository],
})
export class InstructorsModule {}
