import { Module } from '@nestjs/common';

import { SpecializationsController } from './specializations.controller';
import { SpecializationsRepository } from './specializations.repository';
import { SpecializationsService } from './specializations.service';

/**
 * Modul specialization (P3-BE-005). Repository diekspor untuk validasi `specialization_ids` di modul instructors.
 */
@Module({
  controllers: [SpecializationsController],
  providers: [SpecializationsService, SpecializationsRepository],
  exports: [SpecializationsRepository],
})
export class SpecializationsModule {}
