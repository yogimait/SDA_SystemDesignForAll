import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DatabaseService } from "../database.service.js";
import { users } from "../schema.js";
import type {
  CreateUserInput,
  UserRepository,
  UserRow,
} from "./user.repository.js";

@Injectable()
export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: CreateUserInput): Promise<UserRow> {
    const [user] = await this.database.db
      .insert(users)
      .values(input)
      .returning();
    return user;
  }

  async findById(id: string): Promise<UserRow | null> {
    const [user] = await this.database.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user ?? null;
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const [user] = await this.database.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user ?? null;
  }

  async updatePlanTier(
    id: string,
    planTier: UserRow["planTier"],
  ): Promise<UserRow | null> {
    const [user] = await this.database.db
      .update(users)
      .set({ planTier, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user ?? null;
  }
}
