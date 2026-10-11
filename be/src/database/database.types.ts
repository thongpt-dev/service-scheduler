import { Inject } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { DRIZZLE_DB } from "./database.tokens";

export type Database = NodePgDatabase<typeof schema>;
export const InjectDb = () => Inject(DRIZZLE_DB);
