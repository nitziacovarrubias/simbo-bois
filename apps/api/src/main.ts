import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ValidationFilter } from './validation.filter.js';
import { NestFactory } from '@nestjs/core';
import { json, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './module.js';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

function validateEnv(): void {
  if (process.env.PORT && Number.isNaN(Number(process.env.PORT))) throw new Error('PORT inválido');
  if (process.env.CORS_ORIGIN?.includes('*')) throw new Error('CORS_ORIGIN no puede usar wildcard');
}

export async function createApp() {
  validateEnv();
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ValidationFilter());
  app.use(json({ limit: '5mb' }));
  app.use(helmet());
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    credentials: false,
  });
  const http = app.getHttpAdapter().getInstance();
  if (http?.use) {
    http.use((_request: Request, response: Response, next: NextFunction) => {
      response.setHeader('X-SIMBO-Engine', 'Design-Manufacturing');
      next();
    });
  }
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  createApp()
    .then((app) => app.listen(Number(process.env.PORT ?? 3001)))
    .catch((error) => {
      console.error('No se pudo iniciar SIMBO API.', error);
      process.exitCode = 1;
    });
