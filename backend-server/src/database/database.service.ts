import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PGlite } from "@electric-sql/pglite";
import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import {
  drizzle as drizzleNode,
  type NodePgDatabase,
} from "drizzle-orm/node-postgres";
import { migrate as migrateNode } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";
import { fileURLToPath } from "node:url";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { schema } from "./schema.js";

export type AppDatabase =
  | PgliteDatabase<typeof schema>
  | NodePgDatabase<typeof schema>;

const migrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private database?: AppDatabase;
  private pglite?: PGlite;
  private pool?: Pool;
  private initPromise?: Promise<void>;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    await this.init();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pglite) {
      await this.pglite.close();
    }
    if (this.pool) {
      await this.pool.end();
    }
  }

  /** Resolves after the driver is connected and migrations have run. */
  init(): Promise<void> {
    this.initPromise ??= this.initDriver();
    return this.initPromise;
  }

  get db(): AppDatabase {
    if (!this.database) {
      throw new Error("Database accessed before initialization.");
    }
    return this.database;
  }

  get driver(): "pglite" | "postgres" {
    return this.config.DATABASE_DRIVER;
  }

  private async initDriver(): Promise<void> {
    if (this.config.DATABASE_DRIVER === "postgres") {
      const { Pool } = await import("pg");
      this.pool = new Pool({ connectionString: this.config.DATABASE_URL });
      const nodeDb = drizzleNode(this.pool, { schema });
      await migrateNode(nodeDb, { migrationsFolder });
      this.database = nodeDb;
      return;
    }

    this.pglite = new PGlite(this.config.PGLITE_DATA_DIR);
    const pgliteDb = drizzlePglite(this.pglite, { schema });
    await migratePglite(pgliteDb, { migrationsFolder });
    this.database = pgliteDb;
  }
}
