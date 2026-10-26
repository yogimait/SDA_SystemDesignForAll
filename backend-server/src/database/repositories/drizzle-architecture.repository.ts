import { Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { DatabaseService } from "../database.service.js";
import { architectureVersions } from "../schema.js";
import type {
  ArchitectureRepository,
  ArchitectureVersionRow,
  CreateArchitectureVersionInput,
} from "./architecture.repository.js";

@Injectable()
export class DrizzleArchitectureRepository implements ArchitectureRepository {
  constructor(private readonly database: DatabaseService) {}

  async nextVersion(projectId: string): Promise<number> {
    const [row] = await this.database.db
      .select({
        maxVersion: sql<number | null>`max(${architectureVersions.version})`,
      })
      .from(architectureVersions)
      .where(eq(architectureVersions.projectId, projectId));
    return Number(row?.maxVersion ?? 0) + 1;
  }

  async create(
    input: CreateArchitectureVersionInput,
  ): Promise<ArchitectureVersionRow> {
    const [version] = await this.database.db
      .insert(architectureVersions)
      .values(input)
      .returning();
    return version;
  }

  async findByProjectAndVersion(
    projectId: string,
    version: number,
  ): Promise<ArchitectureVersionRow | null> {
    const [row] = await this.database.db
      .select()
      .from(architectureVersions)
      .where(
        and(
          eq(architectureVersions.projectId, projectId),
          eq(architectureVersions.version, version),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findLatest(projectId: string): Promise<ArchitectureVersionRow | null> {
    const [row] = await this.database.db
      .select()
      .from(architectureVersions)
      .where(eq(architectureVersions.projectId, projectId))
      .orderBy(desc(architectureVersions.version))
      .limit(1);
    return row ?? null;
  }
}
