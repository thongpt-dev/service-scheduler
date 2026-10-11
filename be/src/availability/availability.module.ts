import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { AvailabilityControllerV1 } from "./http/v1/availability.controller";
import { AvailabilityService } from "./availability.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AvailabilityControllerV1],
  providers: [AvailabilityService],
})
export class AvailabilityModule {}
