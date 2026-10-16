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
import { TemplateBodyDto } from './dto/template.dto';
import {
  TemplatesService,
  type TemplateDetail,
  type TemplateListItem,
} from './templates.service';

/**
 * Endpoint admin untuk template event (API Spec v1.6 Section 7).
 */
@Roles('admin')
@Controller('admin/event-templates')
export class TemplatesController {
  /**
   * @param service - Logika template.
   */
  constructor(private readonly service: TemplatesService) {}

  /**
   * GET /admin/event-templates
   *
   * @returns Daftar template.
   */
  @Get()
  list(): Promise<TemplateListItem[]> {
    return this.service.list();
  }

  /**
   * GET /admin/event-templates/:id
   *
   * @param id - UUID template.
   * @returns Detail template.
   */
  @Get(':id')
  get(@Param('id', ParseUuidPipe) id: string): Promise<TemplateDetail> {
    return this.service.get(id);
  }

  /**
   * POST /admin/event-templates
   *
   * @param dto - Data template.
   * @returns Template yang dibuat.
   */
  @Post()
  @ResponseMessage('Template berhasil dibuat')
  create(@Body() dto: TemplateBodyDto): Promise<TemplateDetail> {
    return this.service.create(dto);
  }

  /**
   * PUT /admin/event-templates/:id
   *
   * @param id - UUID template.
   * @param dto - Data baru (mengganti seluruh data).
   * @returns Template setelah diperbarui.
   */
  @Put(':id')
  @ResponseMessage('Template berhasil diperbarui')
  update(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: TemplateBodyDto,
  ): Promise<TemplateDetail> {
    return this.service.update(id, dto);
  }

  /**
   * DELETE /admin/event-templates/:id
   *
   * @param id - UUID template.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Template berhasil dihapus')
  remove(@Param('id', ParseUuidPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }
}
