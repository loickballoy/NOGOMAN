import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppConfig } from './config/app-config';

/** Shared HTTP setup for the server and the e2e tests. */
export function configureApp(app: INestApplication) {
  const config = app.get(AppConfig);
  // No upgrade-insecure-requests: over plain HTTP on a LAN or Tailscale IP it makes browsers
  // fetch the docs assets over HTTPS and the page stays blank. Cloudflare terminates TLS in production.
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.enableCors({ origin: config.corsOrigins.length ? config.corsOrigins : false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  if (config.enableDocs) {
    const doc = new DocumentBuilder().setTitle('Nogoman API').setVersion('0.1.0').addBearerAuth().build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }
}
