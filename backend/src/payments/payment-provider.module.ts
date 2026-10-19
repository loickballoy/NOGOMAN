import { Module } from '@nestjs/common';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { PAYMENT_PROVIDER } from './providers/payment-provider';

@Module({
  providers: [MockPaymentProvider, { provide: PAYMENT_PROVIDER, useExisting: MockPaymentProvider }],
  exports: [PAYMENT_PROVIDER, MockPaymentProvider],
})
export class PaymentProviderModule {}
