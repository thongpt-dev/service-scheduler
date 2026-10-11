import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { DbService } from "../database/db.service";

@Injectable()
export class SystemService {
  constructor(
    @Inject(DbService)
    private readonly dbService: Pick<DbService, "checkConnection">,
  ) {}

  getHealth() {
    return {
      status: "ok",
      service: "service-scheduler-api",
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    try {
      await this.dbService.checkConnection();
      return {
        status: "ready",
        database: "ok",
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: "not_ready",
        database: "unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  }
}
