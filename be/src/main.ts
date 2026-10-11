import { Logger, ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./system/api-exception.filter";

const requestLogger = new Logger("HttpRequest");

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });
  const config = app.get(ConfigService);
  const allowedOrigins = (
    config.get<string>("FRONTEND_ORIGIN") ?? "http://localhost:5173"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();
    response.on("finish", () => {
      const event = JSON.stringify({
        event: "http_request",
        method: request.method,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      });

      if (response.statusCode >= 500) {
        requestLogger.error(event);
      } else if (response.statusCode >= 400) {
        requestLogger.warn(event);
      } else {
        requestLogger.log(event);
      }
    });

    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Service Scheduler API")
    .setDescription(
      "Backend API for service scheduling and resource-constrained bookings.",
    )
    .setVersion("1.0.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        name: "Authorization",
        in: "header",
      },
      "bearer-auth",
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  app.enableShutdownHooks();
  const port = Number(config.get<string>("PORT") ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port number");
  }

  await app.listen(port);
}

void bootstrap();
