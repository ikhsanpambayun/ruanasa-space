import { IsOptional, IsUUID } from 'class-validator';

import {
  OptionalText,
  RequiredText,
} from '../../../common/validators/common-fields.decorators';

/**
 * Body create dan update template (API Spec v1.6 Sections 7.3-7.4). PUT mengganti seluruh data:
 * `description` dan `instructor_id` yang tidak dikirim di-reset menjadi null.
 */
export class TemplateBodyDto {
  @RequiredText('Nama template', 150)
  name!: string;

  @RequiredText('Activity type', 50)
  activity_type!: string;

  @OptionalText('Deskripsi', 5000)
  description?: string | null;

  @IsOptional()
  @IsUUID('all', { message: 'ID instructor tidak valid' })
  instructor_id?: string | null;
}
