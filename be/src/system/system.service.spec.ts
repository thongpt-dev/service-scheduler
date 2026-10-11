import { ServiceUnavailableException } from "@nestjs/common";
import { DbService } from "../database/db.service";
import { SystemService } from "./system.service";

describe("SystemService", () => {
  let systemService: SystemService;
  let dbService: jest.Mocked<Pick<DbService, "checkConnection">>;

  beforeEach(() => {
    dbService = { checkConnection: jest.fn() };
    systemService = new SystemService(dbService);
  });

  it("reports process health without querying the database", () => {
    expect(systemService.getHealth()).toMatchObject({
      status: "ok",
      service: "service-scheduler-api",
    });
    expect(dbService.checkConnection).not.toHaveBeenCalled();
  });

  it("reports readiness when the database responds", async () => {
    await expect(systemService.getReadiness()).resolves.toMatchObject({
      status: "ready",
      database: "ok",
    });
    expect(dbService.checkConnection).toHaveBeenCalledTimes(1);
  });

  it("returns a generic unavailable response when the database check fails", async () => {
    dbService.checkConnection.mockRejectedValue(
      new Error("sensitive connection detail"),
    );

    await expect(systemService.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(systemService.getReadiness()).rejects.not.toThrow(
      "sensitive connection detail",
    );
  });
});
