import { ApiPropertyOptional } from '@nestjs/swagger';
import { MobileMoneyOperator } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class FundJobDto {
  @ApiPropertyOptional({ enum: MobileMoneyOperator, description: 'Leave empty to pay by card' })
  @IsOptional() @IsEnum(MobileMoneyOperator)
  operator?: MobileMoneyOperator;

  @ApiPropertyOptional({ description: 'Mobile money number that pays' })
  @IsOptional() @IsString() @MaxLength(32)
  phone?: string;
}
