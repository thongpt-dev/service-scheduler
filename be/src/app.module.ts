import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { SystemModule } from "./system/system.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, SystemModule],
})
export class AppModule {}
