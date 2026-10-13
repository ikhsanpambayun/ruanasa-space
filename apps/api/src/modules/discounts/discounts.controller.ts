import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { PromoValidateRateLimit } from '../../common/decorators/rate-limit.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ValidatePromoDto } from './dto/discount.dto';
import {
  DiscountsService,
  type ValidatedPromoResponse,
} from './discounts.service';

/**
 * Endpoint kode promo untuk peserta (API Spec v1.6 Section 12.4).
 */
@Roles('participant')
@Controller('discount-codes')
export class DiscountsController {
  /**
   * @param service - Logika kode promo.
   */
  constructor(private readonly service: DiscountsService) {}

  /**
   * POST /discount-codes/validate: dipanggil saat peserta menekan "Terapkan".
   *
   * @param dto - Kode promo.
   * @returns Data diskon yang dapat diterapkan.
   */
  @PromoValidateRateLimit()
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Kode promo berhasil diterapkan')
  validate(@Body() dto: ValidatePromoDto): Promise<ValidatedPromoResponse> {
    return this.service.validate(dto.code);
  }
}
