import {
  Body, Controller, Get, HttpCode, NotFoundException, Param, Post, RawBodyRequest, Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Role, User } from '@prisma/client';
import { Request } from 'express';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { AppConfig } from '../config/app-config';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { randomToken } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutsService } from '../payouts/payouts.service';
import { FundJobDto } from './dto';
import { PaymentsService } from './payments.service';
import { MockPaymentProvider } from './providers/mock-payment.provider';

class SimulateDto {
  @IsIn(['SUCCEEDED', 'FAILED']) status: 'SUCCEEDED' | 'FAILED';
  @IsOptional() @IsString() reason?: string;
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly payouts: PayoutsService,
    private readonly mock: MockPaymentProvider,
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  @Roles(Role.FARMER)
  @Get('jobs/:id/funding/quote')
  quote(@CurrentUser() user: User, @Param('id') jobId: string) {
    return this.payments.quote(user, jobId);
  }

  @Roles(Role.FARMER)
  @Post('jobs/:id/funding')
  fund(@CurrentUser() user: User, @Param('id') jobId: string, @Body() dto: FundJobDto) {
    return this.payments.fund(user, jobId, dto);
  }

  @Get('payments/:id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.payments.getPayment(user, id);
  }

  @Get('me/payouts')
  myPayouts(@CurrentUser() user: User) {
    return this.payouts.history(user.id);
  }

  @Public()
  @SkipThrottle()
  @Post('webhooks/payments/:provider')
  @HttpCode(200)
  webhook(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>) {
    return this.payments.handleWebhook(provider, req.headers, req.rawBody ?? Buffer.from(''));
  }

  /** Development only: plays the provider and sends a signed webhook for a payment or payout. */
  @ApiExcludeEndpoint()
  @Public()
  @Post('dev/payments/:kind/:id/simulate')
  @HttpCode(200)
  async simulate(@Param('kind') kind: string, @Param('id') id: string, @Body() dto: SimulateDto) {
    if (!this.config.enableDevRoutes) throw new NotFoundException();
    const record = kind === 'payout'
      ? await this.prisma.payout.findUnique({ where: { id } })
      : kind === 'collection' ? await this.prisma.payment.findUnique({ where: { id } }) : null;
    if (!record?.providerRef) throw new NotFoundException();
    const body = JSON.stringify({
      eventId: `sim_${randomToken(8)}`,
      kind,
      providerRef: record.providerRef,
      status: dto.status,
      reason: dto.reason,
    });
    return this.payments.handleWebhook('mock', { 'x-mock-signature': this.mock.sign(body) }, Buffer.from(body));
  }
}
