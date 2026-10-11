import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { AppointmentsControllerV1 } from "./http/v1/appointments.controller";
import {
  AppointmentLifecycleControllerV1,
  CustomerAppointmentsControllerV1,
  DealershipAppointmentsControllerV1,
} from "./http/v1/appointments-lifecycle.controller";
import { AppointmentsService } from "./appointments.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [
    AppointmentsControllerV1,
    CustomerAppointmentsControllerV1,
    DealershipAppointmentsControllerV1,
    AppointmentLifecycleControllerV1,
  ],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
