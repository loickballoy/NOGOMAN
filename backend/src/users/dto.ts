import { ApiPropertyOptional } from '@nestjs/swagger';
import { MobileMoneyOperator, Role } from '@prisma/client';
import { IsEnum, IsIn, IsLatitude, IsLongitude, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateMeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 60)
  name?: string;

  @ApiPropertyOptional({ enum: [Role.WORKER, Role.FARMER] })
  @IsOptional() @IsIn([Role.WORKER, Role.FARMER])
  role?: Role;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80)
  locality?: string;

  @ApiPropertyOptional() @IsOptional() @IsLatitude()
  lat?: number;

  @ApiPropertyOptional() @IsOptional() @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ enum: MobileMoneyOperator })
  @IsOptional() @IsEnum(MobileMoneyOperator)
  payoutOperator?: MobileMoneyOperator;

  @ApiPropertyOptional({ description: 'Mobile money number for payouts' })
  @IsOptional() @IsString() @MaxLength(32)
  payoutPhone?: string;
}
