import { Module } from '@nestjs/common';

import { EventsModule } from '../events/events.module';
import { PricingController } from './pricing.controller';
import { PricingRepository } from './pricing.repository';
import { PricingService } from './pricing.service';

/**
 * Modul harga event (P3-BE-007): harga normal, early bird, dan aturan bundle.
 * Mesin perhitungan harga ditambahkan di P4-BE-001 dan memakai repository ini.
 */
@Module({
  imports: [EventsModule],
  controllers: [PricingController],
  providers: [PricingService, PricingRepository],
  exports: [PricingRepository],
})
export class PricingModule {}
