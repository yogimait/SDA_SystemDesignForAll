import type { PlanTier } from "@sda/contracts";
import type { users } from "../schema.js";

export type UserRow = typeof users.$inferSelect;

export interface CreateUserInput {
  id: string;
  email: string;
  passwordHash: string;
  planTier: PlanTier;
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<UserRow>;
  findById(id: string): Promise<UserRow | null>;
  findByEmail(email: string): Promise<UserRow | null>;
  updatePlanTier(id: string, planTier: PlanTier): Promise<UserRow | null>;
  markEmailVerified(id: string, at: Date): Promise<UserRow | null>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export const USER_REPOSITORY = Symbol("USER_REPOSITORY");
