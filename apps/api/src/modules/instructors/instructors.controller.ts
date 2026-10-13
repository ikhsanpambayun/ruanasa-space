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
  Query,
} from '@nestjs/common';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  InstructorBodyDto,
  ListInstructorsQueryDto,
} from './dto/instructor.dto';
import {
  InstructorsService,
  type ActiveInstructorItem,
  type InstructorDetail,
  type InstructorListItem,
} from './instructors.service';

/**
 * Endpoint admin untuk instruktur (API Spec v1.6 Section 8).
 */
@Roles('admin')
@Controller('admin/instructors')
export class InstructorsController {
  /**
   * @param service - Logika instruktur.
   */
  constructor(private readonly service: InstructorsService) {}

  /**
   * GET /admin/instructors?status=active
   *
   * @param query - Filter status.
   * @returns Daftar instruktur dengan specialization dan event_count.
   */
  @Get()
  list(@Query() query: ListInstructorsQueryDto): Promise<InstructorListItem[]> {
    return this.service.list(query.status);
  }

  /**
   * GET /admin/instructors/active (didaftarkan sebelum `:id` agar tidak dianggap id).
   *
   * @returns Instruktur aktif untuk dropdown.
   */
  @Get('active')
  listActive(): Promise<ActiveInstructorItem[]> {
    return this.service.listActive();
  }

  /**
   * GET /admin/instructors/:id
   *
   * @param id - UUID instruktur.
   * @returns Detail instruktur.
   */
  @Get(':id')
  get(@Param('id', ParseUuidPipe) id: string): Promise<InstructorDetail> {
    return this.service.get(id);
  }

  /**
   * POST /admin/instructors
   *
   * @param dto - Data instruktur.
   * @returns Instruktur yang dibuat.
   */
  @Post()
  @ResponseMessage('Instructor berhasil ditambahkan')
  create(@Body() dto: InstructorBodyDto): Promise<InstructorDetail> {
    return this.service.create(dto);
  }

  /**
   * PUT /admin/instructors/:id
   *
   * @param id - UUID instruktur.
   * @param dto - Data baru (mengganti seluruh data).
   * @returns Instruktur setelah diperbarui.
   */
  @Put(':id')
  @ResponseMessage('Instructor berhasil diperbarui')
  update(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: InstructorBodyDto,
  ): Promise<InstructorDetail> {
    return this.service.update(id, dto);
  }

  /**
   * DELETE /admin/instructors/:id
   *
   * @param id - UUID instruktur.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Instructor berhasil dihapus')
  remove(@Param('id', ParseUuidPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }
}
