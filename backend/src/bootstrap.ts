import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { raw } from 'express';
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
  if (config.nodeEnv !== 'test') app.use(requestLogger());
  // Voice notes arrive as the raw audio bytes (Content-Type: audio/...). Expo's fetch
  // handles a plain byte body reliably, unlike multipart file parts.
  app.use(raw({ type: 'audio/*', limit: '3mb' }));
  app.enableShutdownHooks();

  if (config.enableDocs) {
    const doc = new DocumentBuilder().setTitle('Nogoman API').setVersion('0.1.0').addBearerAuth().build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }
}

/** "POST /conversations/x/voice 201 84ms 12.3kB", or "aborted" when the client hung up first. */
function requestLogger() {
  const logger = new Logger('HTTP');
  return (req: any, res: any, next: () => void) => {
    const start = Date.now();
    let done = false;
    res.on('finish', () => {
      done = true;
      const size = req.headers['content-length'] ? ` ${(Number(req.headers['content-length']) / 1024).toFixed(1)}kB` : '';
      const line = `${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - start}ms${size}`;
      if (res.statusCode >= 500) logger.error(line);
      else if (res.statusCode >= 400) logger.warn(line);
      else logger.log(line);
    });
    res.on('close', () => {
      if (!done) logger.warn(`${req.method} ${req.originalUrl.split('?')[0]} aborted after ${Date.now() - start}ms`);
    });
    next();
  };
}
