import { Module } from '@nestjs/common';
import { PaymentProviderModule } from '../payments/payment-provider.module';
import { PayoutsService } from './payouts.service';

@Module({ imports: [PaymentProviderModule], providers: [PayoutsService], exports: [PayoutsService] })
export class PayoutsModule {}
