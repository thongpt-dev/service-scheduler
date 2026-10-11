import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import {
  CustomerProfileControllerV1,
  DealershipCustomersControllerV1,
} from "./http/v1/customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [CustomerProfileControllerV1, DealershipCustomersControllerV1],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
