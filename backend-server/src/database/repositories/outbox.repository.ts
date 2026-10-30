import type { devOutbox } from "../schema.js";

export type DevOutboxRow = typeof devOutbox.$inferSelect;

export interface CreateOutboxMessageInput {
  id: string;
  kind: "email_verification" | "password_reset";
  recipient: string;
  link: string;
}

/** Local development only: stores the link an SMTP transport would have sent. */
export interface OutboxRepository {
  create(input: CreateOutboxMessageInput): Promise<DevOutboxRow>;
  listRecent(limit: number): Promise<DevOutboxRow[]>;
}

export const OUTBOX_REPOSITORY = Symbol("OUTBOX_REPOSITORY");
