import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from "@nestjs/common";
import { toApiErrorBody } from "./api-exception.filter";

describe("toApiErrorBody", () => {
  const timestamp = "2026-10-12T00:00:00.000Z";

  it("maps standard HTTP errors to a stable code and message", () => {
    expect(
      toApiErrorBody(new BadRequestException("Invalid request"), timestamp),
    ).toEqual({
      statusCode: 400,
      code: "BAD_REQUEST",
      message: "Invalid request",
      timestamp,
    });
  });

  it("preserves explicit domain error codes and validation messages", () => {
    expect(
      toApiErrorBody(
        new ConflictException({
          code: "SLOT_UNAVAILABLE",
          message: "The requested interval is no longer available",
        }),
        timestamp,
      ),
    ).toEqual({
      statusCode: 409,
      code: "SLOT_UNAVAILABLE",
      message: "The requested interval is no longer available",
      timestamp,
    });

    expect(
      toApiErrorBody(
        new BadRequestException(["startsAt must be zoned", "unknown field"]),
        timestamp,
      ),
    ).toEqual({
      statusCode: 400,
      code: "BAD_REQUEST",
      message: ["startsAt must be zoned", "unknown field"],
      timestamp,
    });
  });

  it("does not expose unexpected internal exception details", () => {
    expect(
      toApiErrorBody(new Error("database password leaked"), timestamp),
    ).toEqual({
      statusCode: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      timestamp,
    });
    expect(
      toApiErrorBody(
        new InternalServerErrorException("internal database detail"),
        timestamp,
      ),
    ).toEqual({
      statusCode: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      timestamp,
    });
  });
});
