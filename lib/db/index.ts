import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está configurada.");
}

declare global {
  // eslint-disable-next-line no-var
  var distribunexPool: Pool | undefined;
}

export const db =
  global.distribunexPool ??
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  global.distribunexPool = db;
}
