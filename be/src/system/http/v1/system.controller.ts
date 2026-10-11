import { Controller, Get } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import { SystemService } from "../../system.service";

@ApiTags("system v1")
@Controller({ version: "1" })
export class SystemControllerV1 {
  constructor(private readonly systemService: SystemService) {}

  @Get("health")
  @ApiOperation({
    summary: "Check API liveness",
    description: "Public process health check; no authentication is required.",
  })
  @ApiOkResponse({ description: "The API process is running." })
  getHealth() {
    return this.systemService.getHealth();
  }

  @Get("ready")
  @ApiOperation({
    summary: "Check API readiness",
    description:
      "Public readiness check that verifies database connectivity; no authentication is required.",
  })
  @ApiOkResponse({ description: "The API and database are ready." })
  @ApiServiceUnavailableResponse({
    description: "The database is unavailable.",
  })
  getReadiness() {
    return this.systemService.getReadiness();
  }
}
