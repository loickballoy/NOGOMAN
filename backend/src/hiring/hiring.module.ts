import { Module } from '@nestjs/common';
import { HiringController } from './hiring.controller';
import { HiringService } from './hiring.service';

@Module({ controllers: [HiringController], providers: [HiringService] })
export class HiringModule {}
