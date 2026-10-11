import { Controller, Get } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AppService } from "../../app.service";

@ApiTags("system v1")
@Controller({ version: "1" })
export class V1AppController {
  constructor(private readonly appService: AppService) {}

  @Get("health")
  @ApiOperation({
    summary: "Check API v1 liveness",
    description: "Public process health check; no authentication is required.",
  })
  @ApiOkResponse({ description: "The API process is running." })
  getHealth() {
    return this.appService.getHealth();
  }

  @Get("ready")
  @ApiOperation({
    summary: "Check API v1 readiness",
    description:
      "Public readiness check that verifies database connectivity; no authentication is required.",
  })
  @ApiOkResponse({ description: "The API and database are ready." })
  @ApiServiceUnavailableResponse({
    description: "The database is unavailable.",
  })
  getReadiness() {
    return this.appService.getReadiness();
  }
}
