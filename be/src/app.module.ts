import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { CustomersModule } from "./customers/customers.module";
import { DealershipsModule } from "./dealerships/dealerships.module";
import { ServiceCatalogModule } from "./service-catalog/service-catalog.module";
import { SystemModule } from "./system/system.module";
import { VehiclesModule } from "./vehicles/vehicles.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    CustomersModule,
    DealershipsModule,
    VehiclesModule,
    ServiceCatalogModule,
    SystemModule,
  ],
})
export class AppModule {}
