import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CustomersModule } from "../customers/customers.module";
import { DatabaseModule } from "../database/database.module";
import {
  CustomerVehicleAccessControllerV1,
  CustomerVehiclesControllerV1,
  DealershipCustomerVehiclesControllerV1,
  DealershipVehicleControllerV1,
} from "./http/v1/vehicles.controller";
import { VehiclesService } from "./vehicles.service";

@Module({
  imports: [AuthModule, CustomersModule, DatabaseModule],
  controllers: [
    CustomerVehiclesControllerV1,
    DealershipCustomerVehiclesControllerV1,
    DealershipVehicleControllerV1,
    CustomerVehicleAccessControllerV1,
  ],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
