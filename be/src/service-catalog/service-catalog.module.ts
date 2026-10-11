import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import {
  DealershipServicesControllerV1,
  ServiceTypesControllerV1,
} from "./http/v1/service-catalog.controller";
import { ServiceCatalogService } from "./service-catalog.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ServiceTypesControllerV1, DealershipServicesControllerV1],
  providers: [ServiceCatalogService],
})
export class ServiceCatalogModule {}
