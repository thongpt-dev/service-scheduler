import {
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { DATABASE_POOL, DRIZZLE_DB } from "./database.tokens";
import { DbService } from "./db.service";

@Injectable()
class DatabasePoolLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({
          connectionString: config.getOrThrow<string>("DATABASE_URL"),
        }),
    },
    {
      provide: DRIZZLE_DB,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool) => drizzle({ client: pool, schema }),
    },
    DatabasePoolLifecycle,
    DbService,
  ],
  exports: [DRIZZLE_DB, DbService],
})
export class DatabaseModule {}
