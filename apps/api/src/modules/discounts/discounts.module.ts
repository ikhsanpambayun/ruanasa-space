import { Module } from '@nestjs/common';

import { DiscountsAdminController } from './discounts-admin.controller';
import { DiscountsController } from './discounts.controller';
import { DiscountsRepository } from './discounts.repository';
import { DiscountsService } from './discounts.service';

/**
 * Modul kode promo (P3-BE-009). Repository diekspor untuk perhitungan harga dan registrasi (Phase 4).
 */
@Module({
  controllers: [DiscountsAdminController, DiscountsController],
  providers: [DiscountsService, DiscountsRepository],
  exports: [DiscountsRepository],
})
export class DiscountsModule {}
