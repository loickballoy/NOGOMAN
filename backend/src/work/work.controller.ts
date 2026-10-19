import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { IsDateString, IsLatitude, IsLongitude, IsString, Length } from 'class-validator';
import { CurrentUser, Roles } from '../common/decorators';
import { WorkService } from './work.service';

class CheckInDto {
  @ApiProperty() @IsLatitude() lat: number;
  @ApiProperty() @IsLongitude() lng: number;
}

class DisputeDto {
  @ApiProperty() @IsString() @Length(3, 500) reason: string;
}

class ConfirmDayDto {
  @ApiProperty({ example: '2026-11-02' }) @IsDateString({ strict: true }) date: string;
}

@ApiTags('work')
@ApiBearerAuth()
@Controller()
export class WorkController {
  constructor(private readonly work: WorkService) {}

  @Get('engagements/mine')
  mine(@CurrentUser() user: User) {
    return this.work.listMine(user);
  }

  @Get('engagements/:id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.work.get(user, id);
  }

  @Post('engagements/:id/cancel')
  cancel(@CurrentUser() user: User, @Param('id') id: string) {
    return this.work.cancel(user, id);
  }

  @Roles(Role.WORKER)
  @Post('work-units/:id/check-in')
  checkIn(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: CheckInDto) {
    return this.work.checkIn(user, id, dto.lat, dto.lng);
  }

  @Roles(Role.WORKER)
  @Post('work-units/:id/done')
  done(@CurrentUser() user: User, @Param('id') id: string) {
    return this.work.markTaskDone(user, id);
  }

  @Roles(Role.FARMER)
  @Post('work-units/:id/confirm')
  confirm(@CurrentUser() user: User, @Param('id') id: string) {
    return this.work.confirm(user, id);
  }

  @Roles(Role.FARMER)
  @Post('jobs/:id/confirm-day')
  confirmDay(@CurrentUser() user: User, @Param('id') jobId: string, @Body() dto: ConfirmDayDto) {
    return this.work.confirmDay(user, jobId, dto.date);
  }

  @Post('work-units/:id/dispute')
  dispute(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: DisputeDto) {
    return this.work.dispute(user, id, dto.reason);
  }
}
