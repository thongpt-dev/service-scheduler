import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppService } from "./app.service";
import { DatabaseModule } from "./database/database.module";
import { V1AppController } from "./http/v1/app.controller";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
  controllers: [V1AppController],
  providers: [AppService],
})
export class AppModule {}
