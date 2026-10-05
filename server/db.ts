import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV === "test" ? "postgres://localhost:5432/test" : undefined);

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
export const db = drizzle(pool, { schema });
