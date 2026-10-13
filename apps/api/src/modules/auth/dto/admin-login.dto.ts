import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { EmailField } from '../../../common/validators/auth-fields.decorators';

export class AdminLoginDto {
  @EmailField()
  email!: string;

  @IsString({ message: 'Password wajib diisi' })
  @IsNotEmpty({ message: 'Password wajib diisi' })
  @MaxLength(128, { message: 'Password terlalu panjang' })
  password!: string;
}
