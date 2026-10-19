import { Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AfricasTalkingSmsProvider } from './sms/africastalking-sms.provider';
import { ConsoleSmsProvider } from './sms/console-sms.provider';
import { OrangeSmsProvider } from './sms/orange-sms.provider';
import { SMS_PROVIDER } from './sms/sms.provider';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    ConsoleSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [AppConfig, ConsoleSmsProvider],
      useFactory: (config: AppConfig, consoleProvider: ConsoleSmsProvider) =>
        config.smsProvider === 'orange' ? new OrangeSmsProvider(config)
          : config.smsProvider === 'africastalking' ? new AfricasTalkingSmsProvider(config)
            : consoleProvider,
    },
  ],
  exports: [SMS_PROVIDER, ConsoleSmsProvider],
})
export class AuthModule {}
