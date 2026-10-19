import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, Roles } from '../common/decorators';
import { HiringService } from './hiring.service';

class ApplyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  message?: string;
}

@ApiTags('hiring')
@ApiBearerAuth()
@Controller()
export class HiringController {
  constructor(private readonly hiring: HiringService) {}

  @Roles(Role.WORKER)
  @Post('jobs/:id/applications')
  apply(@CurrentUser() user: User, @Param('id') jobId: string, @Body() dto: ApplyDto) {
    return this.hiring.apply(user, jobId, dto.message);
  }

  @Roles(Role.FARMER)
  @Get('jobs/:id/applications')
  list(@CurrentUser() user: User, @Param('id') jobId: string) {
    return this.hiring.listForJob(user, jobId);
  }

  @Roles(Role.WORKER)
  @Get('applications/mine')
  mine(@CurrentUser() user: User) {
    return this.hiring.mine(user);
  }

  @Roles(Role.WORKER)
  @Post('applications/:id/withdraw')
  withdraw(@CurrentUser() user: User, @Param('id') id: string) {
    return this.hiring.withdraw(user, id);
  }

  @Roles(Role.FARMER)
  @Post('applications/:id/reject')
  reject(@CurrentUser() user: User, @Param('id') id: string) {
    return this.hiring.reject(user, id);
  }

  @Roles(Role.FARMER)
  @Post('applications/:id/hire')
  hire(@CurrentUser() user: User, @Param('id') id: string) {
    return this.hiring.hire(user, id);
  }
}
