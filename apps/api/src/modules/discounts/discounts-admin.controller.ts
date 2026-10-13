import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';

import { PaginatedResult } from '../../common/dto/paginated-result';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateDiscountCodeDto,
  ListDiscountCodesQueryDto,
  UpdateDiscountCodeDto,
} from './dto/discount.dto';
import {
  DiscountsService,
  type DiscountCodeResponse,
} from './discounts.service';

/**
 * Endpoint admin untuk kode promo (API Spec v1.6 Sections 12.1-12.3).
 */
@Roles('admin')
@Controller('admin/discount-codes')
export class DiscountsAdminController {
  /**
   * @param service - Logika kode promo.
   */
  constructor(private readonly service: DiscountsService) {}

  /**
   * GET /admin/discount-codes?status=&page=&per_page=
   *
   * @param query - Filter status dan pagination.
   * @returns Halaman kode promo.
   */
  @Get()
  list(
    @Query() query: ListDiscountCodesQueryDto,
  ): Promise<PaginatedResult<DiscountCodeResponse>> {
    return this.service.list(query);
  }

  /**
   * POST /admin/discount-codes
   *
   * @param dto - Data kode promo.
   * @returns Kode promo yang dibuat.
   */
  @Post()
  @ResponseMessage('Kode promo berhasil dibuat')
  create(@Body() dto: CreateDiscountCodeDto): Promise<DiscountCodeResponse> {
    return this.service.create(dto);
  }

  /**
   * PUT /admin/discount-codes/:id
   *
   * @param id - UUID kode promo.
   * @param dto - Nilai baru (kode tidak dapat diubah).
   * @returns Kode promo setelah diperbarui.
   */
  @Put(':id')
  @ResponseMessage('Kode promo berhasil diperbarui')
  update(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateDiscountCodeDto,
  ): Promise<DiscountCodeResponse> {
    return this.service.update(id, dto);
  }
}
