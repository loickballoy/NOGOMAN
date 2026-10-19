import { Module } from '@nestjs/common';
import { PayoutsModule } from '../payouts/payouts.module';
import { PaymentProviderModule } from './payment-provider.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [PaymentProviderModule, PayoutsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
