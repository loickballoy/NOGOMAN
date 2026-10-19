import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { JobCategory, PayMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString, IsEnum, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min,
} from 'class-validator';

export class CreateJobDto {
  @ApiProperty({ example: 'Récolte de cacao' }) @IsString() @Length(3, 80)
  title: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: JobCategory }) @IsEnum(JobCategory)
  category: JobCategory;

  @ApiPropertyOptional({ example: 'Cacao' }) @IsOptional() @IsString() @MaxLength(40)
  crop?: string;

  @ApiProperty({ enum: PayMode }) @IsEnum(PayMode)
  payMode: PayMode;

  @ApiProperty({ description: 'XOF per day (DAILY) or per worker for the task (TASK)', example: 4500 })
  @IsInt() @Min(100) @Max(1_000_000)
  rateXof: number;

  @ApiProperty({ example: 3 }) @IsInt() @Min(1) @Max(50)
  workersNeeded: number;

  @ApiProperty({ description: 'Paid days (DAILY) or estimated days (TASK)', example: 14 })
  @IsInt() @Min(1) @Max(90)
  durationDays: number;

  @ApiProperty({ example: '2026-11-02' }) @IsDateString({ strict: true })
  startDate: string;

  @ApiPropertyOptional({ description: 'Fallback name if the server cannot geocode the position', example: 'Daloa' })
  @IsOptional() @IsString() @Length(2, 80)
  locality?: string;

  @ApiProperty() @IsLatitude()
  lat: number;

  @ApiProperty() @IsLongitude()
  lng: number;
}

export class UpdateJobDto extends PartialType(
  PickType(CreateJobDto, ['title', 'description', 'crop', 'rateXof', 'workersNeeded', 'durationDays', 'startDate'] as const),
) {}

export class SearchJobsDto {
  @ApiProperty() @Type(() => Number) @IsLatitude()
  lat: number;

  @ApiProperty() @Type(() => Number) @IsLongitude()
  lng: number;

  @ApiPropertyOptional({ default: 25 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(150)
  radiusKm?: number;

  @ApiPropertyOptional({ enum: JobCategory }) @IsOptional() @IsEnum(JobCategory)
  category?: JobCategory;

  @ApiPropertyOptional({ enum: PayMode }) @IsOptional() @IsEnum(PayMode)
  payMode?: PayMode;

  @ApiPropertyOptional({ default: 30 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}
