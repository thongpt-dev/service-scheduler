import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string | string[];
  timestamp: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codeForStatus(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 422:
      return "UNPROCESSABLE_ENTITY";
    case 429:
      return "TOO_MANY_REQUESTS";
    case 503:
      return "SERVICE_UNAVAILABLE";
    default:
      return statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "HTTP_ERROR";
  }
}

export function toApiErrorBody(
  exception: unknown,
  timestamp = new Date().toISOString(),
): ApiErrorBody {
  if (!(exception instanceof HttpException)) {
    return {
      statusCode: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      timestamp,
    };
  }

  const statusCode = exception.getStatus();
  const response = exception.getResponse();
  const responseObject = isRecord(response) ? response : undefined;
  const responseCode = responseObject?.code;
  const code =
    typeof responseCode === "string" ? responseCode : codeForStatus(statusCode);
  if (statusCode >= 500) {
    return {
      statusCode,
      code,
      message: "Internal server error",
      timestamp,
    };
  }

  const responseMessage = responseObject?.message;
  const message =
    typeof responseMessage === "string" ||
    (Array.isArray(responseMessage) &&
      responseMessage.every((item) => typeof item === "string"))
      ? responseMessage
      : typeof response === "string"
        ? response
        : exception.message;

  return {
    statusCode,
    code,
    message,
    timestamp,
  };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const errorBody = toApiErrorBody(exception);
    response.status(errorBody.statusCode).json(errorBody);
  }
}
