import { Injectable } from "@nestjs/common";
import { desc } from "drizzle-orm";
import { DatabaseService } from "../database.service.js";
import { devOutbox } from "../schema.js";
import type {
  CreateOutboxMessageInput,
  DevOutboxRow,
  OutboxRepository,
} from "./outbox.repository.js";

@Injectable()
export class DrizzleOutboxRepository implements OutboxRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: CreateOutboxMessageInput): Promise<DevOutboxRow> {
    const [row] = await this.database.db
      .insert(devOutbox)
      .values(input)
      .returning();
    return row;
  }

  async listRecent(limit: number): Promise<DevOutboxRow[]> {
    return this.database.db
      .select()
      .from(devOutbox)
      .orderBy(desc(devOutbox.createdAt))
      .limit(limit);
  }
}
