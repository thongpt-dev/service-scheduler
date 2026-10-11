import { ServiceUnavailableException } from "@nestjs/common";
import { AppService } from "./app.service";
import { DbService } from "./database/db.service";

describe("AppService", () => {
  let appService: AppService;
  let dbService: jest.Mocked<Pick<DbService, "checkConnection">>;

  beforeEach(() => {
    dbService = { checkConnection: jest.fn() };
    appService = new AppService(dbService as DbService);
  });

  it("reports process health without querying the database", () => {
    expect(appService.getHealth()).toMatchObject({
      status: "ok",
      service: "service-scheduler-api",
    });
    expect(dbService.checkConnection).not.toHaveBeenCalled();
  });

  it("reports readiness when the database responds", async () => {
    await expect(appService.getReadiness()).resolves.toMatchObject({
      status: "ready",
      database: "ok",
    });
    expect(dbService.checkConnection).toHaveBeenCalledTimes(1);
  });

  it("returns a generic unavailable response when the database check fails", async () => {
    dbService.checkConnection.mockRejectedValue(
      new Error("sensitive connection detail"),
    );

    await expect(appService.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(appService.getReadiness()).rejects.not.toThrow(
      "sensitive connection detail",
    );
  });
});
