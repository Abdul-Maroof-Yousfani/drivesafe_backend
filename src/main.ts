import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import cookieParser from 'cookie-parser';
import * as dotenv from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Use Winston Logger
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Enable Cookie Parser
  app.use(cookieParser());

  // Set Global Prefix
  app.setGlobalPrefix('api');

  // Enable CORS with wildcard subdomain support for production
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      const allowedOrigins: string[] = [];

      // Add production domains from env (comma-separated)
      if (process.env.FRONTEND_URL) {
        const envOrigins = process.env.FRONTEND_URL.split(',').map((url) =>
          url.trim(),
        );
        allowedOrigins.push(...envOrigins);
      }

      // Production wildcard pattern (e.g., https://*.drivesafe.com)
      const productionPattern = /^https:\/\/.*\.drivesafe\.com$/;

      // Development patterns
      const devPatterns = [
        /^http:\/\/localhost:\d+$/,
        /^http:\/\/.*\.localhost:\d+$/,
        /^http:\/\/127\.0\.0\.1:\d+$/,
      ];

      // Check if origin is allowed
      const isAllowed =
        allowedOrigins.includes(origin) ||
        productionPattern.test(origin) ||
        (process.env.NODE_ENV !== 'production' &&
          devPatterns.some((pattern) => pattern.test(origin)));

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Host',
      'X-Forwarded-Host',
    ],
  });

  // Global Response Interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Global Validation Pipe
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('DriveSafe API')
    .setDescription('The DriveSafe API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
  console.log(`Swagger Docs available at: ${await app.getUrl()}/api/docs`);
}
bootstrap();
