import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { TechniciansControllerV1 } from "./http/v1/technicians.controller";
import { TechniciansService } from "./technicians.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [TechniciansControllerV1],
  providers: [TechniciansService],
})
export class TechniciansModule {}
