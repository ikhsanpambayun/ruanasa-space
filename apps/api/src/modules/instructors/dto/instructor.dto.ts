import type { ActiveStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

import {
  OptionalText,
  OptionalUrl,
  RequiredText,
} from '../../../common/validators/common-fields.decorators';

const ACTIVE_STATUSES: ActiveStatus[] = ['active', 'inactive'];

/**
 * Body create dan update instruktur (PUT mengganti seluruh data: field opsional yang tidak dikirim di-reset).
 */
export class InstructorBodyDto {
  @RequiredText('Nama instructor', 100)
  name!: string;

  @OptionalUrl('Foto profil', 500)
  profile_picture?: string | null;

  @OptionalText('Bio', 2000)
  bio?: string | null;

  @OptionalText('Informasi kontak', 500)
  contact_information?: string | null;

  @IsOptional()
  @IsArray({ message: 'specialization_ids harus berupa daftar' })
  @ArrayMaxSize(20, { message: 'Maksimal 20 specialization' })
  @ArrayUnique({ message: 'Specialization tidak boleh duplikat' })
  @IsUUID('all', { each: true, message: 'ID specialization tidak valid' })
  specialization_ids?: string[];

  @IsOptional()
  @IsIn(ACTIVE_STATUSES, { message: 'Status harus active atau inactive' })
  status?: ActiveStatus;
}

/**
 * Query filter daftar instruktur: `?status=active`.
 */
export class ListInstructorsQueryDto {
  @IsOptional()
  @IsIn(ACTIVE_STATUSES, { message: 'Status harus active atau inactive' })
  status?: ActiveStatus;
}
