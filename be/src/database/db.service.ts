import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { InjectDb, type Database } from "./database.types";

@Injectable()
export class DbService {
  constructor(@InjectDb() private readonly db: Database) {}

  async checkConnection(): Promise<void> {
    await this.db.execute(sql`SELECT 1`);
  }
}
