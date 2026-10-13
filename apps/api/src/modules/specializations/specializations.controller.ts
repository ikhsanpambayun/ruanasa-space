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
import { SpecializationBodyDto } from './dto/specialization.dto';
import {
  SpecializationsService,
  type SpecializationResponse,
} from './specializations.service';

/**
 * Endpoint admin untuk specialization (API Spec v1.6 Section 9).
 */
@Roles('admin')
@Controller('admin/specializations')
export class SpecializationsController {
  /**
   * @param service - Logika specialization.
   */
  constructor(private readonly service: SpecializationsService) {}

  /**
   * GET /admin/specializations
   *
   * @returns Daftar specialization dengan `instructor_count`.
   */
  @Get()
  list(): Promise<SpecializationResponse[]> {
    return this.service.list();
  }

  /**
   * POST /admin/specializations
   *
   * @param dto - Nama specialization.
   * @returns Specialization baru.
   */
  @Post()
  @ResponseMessage('Specialization berhasil ditambahkan')
  create(@Body() dto: SpecializationBodyDto): Promise<SpecializationResponse> {
    return this.service.create(dto.name);
  }

  /**
   * PUT /admin/specializations/:id
   *
   * @param id - UUID specialization.
   * @param dto - Nama baru.
   * @returns Specialization setelah diperbarui.
   */
  @Put(':id')
  @ResponseMessage('Specialization berhasil diperbarui')
  update(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: SpecializationBodyDto,
  ): Promise<SpecializationResponse> {
    return this.service.update(id, dto.name);
  }

  /**
   * DELETE /admin/specializations/:id
   *
   * @param id - UUID specialization.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Specialization berhasil dihapus')
  remove(@Param('id', ParseUuidPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }
}
