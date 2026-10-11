import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { SystemControllerV1 } from "./http/v1/system.controller";
import { SystemService } from "./system.service";

@Module({
  imports: [DatabaseModule],
  controllers: [SystemControllerV1],
  providers: [SystemService],
})
export class SystemModule {}
