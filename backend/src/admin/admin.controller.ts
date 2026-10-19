import { Body, Controller, Get, Module, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { KycStatus, Role } from '@prisma/client';
import { IsEnum, IsIn, IsInt, Max, Min } from 'class-validator';
import { Roles } from '../common/decorators';
import { LedgerService } from '../ledger/ledger.service';
import { PayoutsModule } from '../payouts/payouts.module';
import { PayoutsService } from '../payouts/payouts.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkModule } from '../work/work.module';
import { WorkService } from '../work/work.service';

class ResolveDto {
  @ApiProperty({ enum: ['RELEASE', 'REFUND'] }) @IsIn(['RELEASE', 'REFUND']) outcome: 'RELEASE' | 'REFUND';
}

class KycDto {
  @ApiProperty({ minimum: 0, maximum: 2 }) @IsInt() @Min(0) @Max(2) level: number;
  @ApiProperty({ enum: KycStatus }) @IsEnum(KycStatus) status: KycStatus;
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly work: WorkService,
    private readonly payouts: PayoutsService,
  ) {}

  @Get('disputes')
  disputes() {
    return this.prisma.workUnit.findMany({
      where: { status: 'DISPUTED' },
      orderBy: { updatedAt: 'asc' },
      include: { engagement: { include: { job: { select: { id: true, title: true, farmerId: true } } } } },
    });
  }

  @Post('work-units/:id/resolve')
  resolve(@Param('id') id: string, @Body() dto: ResolveDto) {
    return this.work.resolveDispute(id, dto.outcome);
  }

  /** Manual verification, e.g. by a field agent for someone without a phone camera. */
  @Post('users/:id/kyc')
  setKyc(@Param('id') id: string, @Body() dto: KycDto) {
    return this.prisma.user.update({
      where: { id },
      data: { kycLevel: dto.level, kycStatus: dto.status },
      select: { id: true, kycLevel: true, kycStatus: true },
    });
  }

  @Get('ledger/trial-balance')
  trialBalance() {
    return this.ledger.trialBalance();
  }

  @Post('payouts/run')
  async runPayouts() {
    return { started: await this.payouts.runBatch() };
  }

  @Post('work/auto-release')
  autoRelease() {
    return this.work.autoRelease();
  }
}

@Module({ imports: [WorkModule, PayoutsModule], controllers: [AdminController] })
export class AdminModule {}
