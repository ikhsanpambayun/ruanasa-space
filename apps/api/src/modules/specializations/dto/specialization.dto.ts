import { RequiredText } from '../../../common/validators/common-fields.decorators';

/**
 * Body create/update specialization: `{ name }` (maks 100 karakter).
 */
export class SpecializationBodyDto {
  @RequiredText('Nama specialization', 100)
  name!: string;
}
