import { Module } from '@nestjs/common';

import { InstructorsModule } from '../instructors/instructors.module';
import { TemplatesController } from './templates.controller';
import { TemplatesRepository } from './templates.repository';
import { TemplatesService } from './templates.service';

/**
 * Modul template event (P3-BE-006). Template hanya menyimpan nama, jenis aktivitas, deskripsi, dan instruktur;
 * harga dan add-on diatur per event.
 */
@Module({
  imports: [InstructorsModule],
  controllers: [TemplatesController],
  providers: [TemplatesService, TemplatesRepository],
  exports: [TemplatesRepository],
})
export class TemplatesModule {}
