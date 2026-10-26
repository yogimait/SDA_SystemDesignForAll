import { defineConfig } from "drizzle-kit";

/**
 * Generate-only config. SQL is applied at boot by the migrator in
 * DatabaseService, against PGlite or Postgres.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: "postgres://unused:unused@localhost:5432/unused",
  },
  strict: true,
  verbose: true,
});
