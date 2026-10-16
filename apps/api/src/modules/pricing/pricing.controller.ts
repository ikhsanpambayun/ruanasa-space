import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import { PriceBodyDto, PricingRuleBodyDto } from './dto/pricing.dto';
import {
  PricingService,
  type EventPricingResponse,
  type PriceResponse,
  type PricingRuleResponse,
} from './pricing.service';

/**
 * Endpoint admin untuk harga dan aturan bundle per event (API Spec v1.6 Section 10).
 */
@Roles('admin')
@Controller('admin/events/:eventId')
export class PricingController {
  /**
   * @param service - Logika harga.
   */
  constructor(private readonly service: PricingService) {}

  /**
   * GET /admin/events/:eventId/pricing
   *
   * @param eventId - UUID event.
   * @returns Harga dan aturan bundle.
   */
  @Get('pricing')
  getPricing(
    @Param('eventId', ParseUuidPipe) eventId: string,
  ): Promise<EventPricingResponse> {
    return this.service.getPricing(eventId);
  }

  /**
   * POST /admin/events/:eventId/prices
   *
   * @param eventId - UUID event.
   * @param dto - Data harga.
   * @returns Harga yang dibuat.
   */
  @Post('prices')
  @ResponseMessage('Harga berhasil ditambahkan')
  createPrice(
    @Param('eventId', ParseUuidPipe) eventId: string,
    @Body() dto: PriceBodyDto,
  ): Promise<PriceResponse> {
    return this.service.createPrice(eventId, dto);
  }

  /**
   * PUT /admin/events/:eventId/prices/:priceId
   *
   * @param eventId - UUID event.
   * @param priceId - UUID harga.
   * @param dto - Data baru.
   * @returns Harga setelah diperbarui.
   */
  @Put('prices/:priceId')
  @ResponseMessage('Harga berhasil diperbarui')
  updatePrice(
    @Param('eventId', ParseUuidPipe) eventId: string,
    @Param('priceId', ParseUuidPipe) priceId: string,
    @Body() dto: PriceBodyDto,
  ): Promise<PriceResponse> {
    return this.service.updatePrice(eventId, priceId, dto);
  }

  /**
   * DELETE /admin/events/:eventId/prices/:priceId
   *
   * @param eventId - UUID event.
   * @param priceId - UUID harga.
   */
  @Delete('prices/:priceId')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Harga berhasil dihapus')
  removePrice(
    @Param('eventId', ParseUuidPipe) eventId: string,
    @Param('priceId', ParseUuidPipe) priceId: string,
  ): Promise<void> {
    return this.service.removePrice(eventId, priceId);
  }

  /**
   * POST /admin/events/:eventId/pricing-rules
   *
   * @param eventId - UUID event.
   * @param dto - Data aturan bundle.
   * @returns Aturan yang dibuat.
   */
  @Post('pricing-rules')
  @ResponseMessage('Aturan bundle berhasil ditambahkan')
  createRule(
    @Param('eventId', ParseUuidPipe) eventId: string,
    @Body() dto: PricingRuleBodyDto,
  ): Promise<PricingRuleResponse> {
    return this.service.createRule(eventId, dto);
  }

  /**
   * PUT /admin/events/:eventId/pricing-rules/:ruleId
   *
   * @param eventId - UUID event.
   * @param ruleId - UUID aturan.
   * @param dto - Data baru.
   * @returns Aturan setelah diperbarui.
   */
  @Put('pricing-rules/:ruleId')
  @ResponseMessage('Aturan bundle berhasil diperbarui')
  updateRule(
    @Param('eventId', ParseUuidPipe) eventId: string,
    @Param('ruleId', ParseUuidPipe) ruleId: string,
    @Body() dto: PricingRuleBodyDto,
  ): Promise<PricingRuleResponse> {
    return this.service.updateRule(eventId, ruleId, dto);
  }

  /**
   * DELETE /admin/events/:eventId/pricing-rules/:ruleId
   *
   * @param eventId - UUID event.
   * @param ruleId - UUID aturan.
   */
  @Delete('pricing-rules/:ruleId')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Aturan bundle berhasil dihapus')
  removeRule(
    @Param('eventId', ParseUuidPipe) eventId: string,
    @Param('ruleId', ParseUuidPipe) ruleId: string,
  ): Promise<void> {
    return this.service.removeRule(eventId, ruleId);
  }
}
