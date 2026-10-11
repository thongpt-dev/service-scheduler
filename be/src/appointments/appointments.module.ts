import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { AppointmentsControllerV1 } from "./http/v1/appointments.controller";
import { AppointmentsService } from "./appointments.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AppointmentsControllerV1],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
