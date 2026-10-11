import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AvailabilityModule } from "./availability/availability.module";
import { AppointmentsModule } from "./appointments/appointments.module";
import { AuthModule } from "./auth/auth.module";
import { CustomersModule } from "./customers/customers.module";
import { DealershipsModule } from "./dealerships/dealerships.module";
import { ServiceCatalogModule } from "./service-catalog/service-catalog.module";
import { ServiceBaysModule } from "./service-bays/service-bays.module";
import { SystemModule } from "./system/system.module";
import { TechniciansModule } from "./technicians/technicians.module";
import { VehiclesModule } from "./vehicles/vehicles.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    AvailabilityModule,
    AppointmentsModule,
    CustomersModule,
    DealershipsModule,
    VehiclesModule,
    ServiceCatalogModule,
    ServiceBaysModule,
    TechniciansModule,
    SystemModule,
  ],
})
export class AppModule {}
