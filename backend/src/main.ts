import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { AppConfig } from './config/app-config';

async function bootstrap() {
  // rawBody is needed to verify payment webhook signatures.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Behind Cloudflare Tunnel: trust the proxy so rate limiting sees the real client IP.
  app.set('trust proxy', 1);
  configureApp(app);
  const config = app.get(AppConfig);
  await app.listen(config.port, '0.0.0.0');
  Logger.log(`Nogoman API listening on :${config.port}`, 'Bootstrap');
}

bootstrap();
