import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './module.js';

function validateEnv(): void {
  if (process.env.PORT && Number.isNaN(Number(process.env.PORT))) throw new Error('PORT inválido');
  if (process.env.CORS_ORIGIN?.includes('*')) throw new Error('CORS_ORIGIN no puede usar wildcard');
}

async function bootstrap(): Promise<void> {
  validateEnv();
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.setGlobalPrefix('api');
  app.use(json({ limit: '5mb' }));
  app.use(helmet());
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'], credentials: false });
  const http = app.getHttpAdapter().getInstance();
  if (http?.use) {
    http.use((_request: Request, response: Response, next: NextFunction) => {
      response.setHeader('X-SIMBO-Engine', 'Design-Manufacturing');
      next();
    });
  }
  await app.listen(Number(process.env.PORT ?? 3001));
}

bootstrap().catch(error => {
  console.error('No se pudo iniciar SIMBO API.', error);
  process.exitCode = 1;
});
