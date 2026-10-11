import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { ServiceBaysControllerV1 } from "./http/v1/service-bays.controller";
import { ServiceBaysService } from "./service-bays.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ServiceBaysControllerV1],
  providers: [ServiceBaysService],
})
export class ServiceBaysModule {}
