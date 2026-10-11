import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import {
  CustomerDealershipsControllerV1,
  DealershipsControllerV1,
} from "./http/v1/dealerships.controller";
import { DealershipsService } from "./dealerships.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [DealershipsControllerV1, CustomerDealershipsControllerV1],
  providers: [DealershipsService],
  exports: [DealershipsService],
})
export class DealershipsModule {}
