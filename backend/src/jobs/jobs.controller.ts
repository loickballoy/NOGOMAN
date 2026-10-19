import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { CurrentUser, Roles } from '../common/decorators';
import { CreateJobDto, SearchJobsDto, UpdateJobDto } from './dto';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Roles(Role.FARMER)
  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateJobDto) {
    return this.jobs.create(user, dto);
  }

  @Get()
  search(@CurrentUser() user: User, @Query() q: SearchJobsDto) {
    return this.jobs.search(user, q);
  }

  @Roles(Role.FARMER)
  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.jobs.mine(user);
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.jobs.getForViewer(id, user);
  }

  @Roles(Role.FARMER)
  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateJobDto) {
    return this.jobs.update(id, user, dto);
  }

  @Roles(Role.FARMER)
  @Post(':id/cancel')
  cancel(@CurrentUser() user: User, @Param('id') id: string) {
    return this.jobs.cancel(id, user);
  }
}
