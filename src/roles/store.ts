/**
 * RoleStore — persists engineering roles (H11) in the existing `agents` collection,
 * discriminated by metadata.kind === "role". Reuses DefinitionStore for writes (so
 * created_at is preserved) and queries the collection directly (via the Mongoose
 * `AgentModel`) for role-filtered reads.
 */

import { ensureMongoose } from "../db/mongoose.js";
import { AGENTS_COLLECTION, AgentModel } from "../models/definition.model.js";
import { DefinitionStore } from "../projectctx/store.js";
import { type Role, makeRole } from "./schema.js";

/** Map a stored agent-definition document back into a Role. */
export function roleFromDoc(doc: Record<string, unknown>): Role {
  const m = (doc.metadata ?? {}) as Record<string, unknown>;
  return makeRole({
    name: String(doc.name ?? ""),
    lens: String(doc.content ?? ""),
    description: String(doc.description ?? ""),
    mode: (m.mode as Role["mode"]) ?? "review",
    severity: (m.severity as Role["severity"]) ?? "advisory",
    triggers: (m.triggers as string[]) ?? [],
    denyGlobs: (m.denyGlobs as string[]) ?? [],
    skills: (m.skills as string[]) ?? [],
    binding: (m.binding as Role["binding"]) ?? { host: "model", model: null },
  });
}

export class RoleStore {
  readonly collection = AGENTS_COLLECTION;

  /** Upsert a role as an agent definition with metadata.kind="role". */
  async upsert(project: string, role: Role): Promise<Role> {
    await new DefinitionStore("agent").upsert({
      project,
      name: role.name,
      description: role.description,
      content: role.lens,
      source: "role",
      tags: ["role", `mode:${role.mode}`, `severity:${role.severity}`],
      metadata: {
        kind: "role",
        mode: role.mode,
        severity: role.severity,
        triggers: role.triggers,
        denyGlobs: role.denyGlobs,
        skills: role.skills,
        binding: role.binding,
      },
    });
    return role;
  }

  async get(project: string, name: string): Promise<Role | null> {
    await ensureMongoose();
    const doc = await AgentModel.findOne({ project, name, "metadata.kind": "role" }).lean();
    return doc ? roleFromDoc(doc) : null;
  }

  async list(project: string): Promise<Role[]> {
    await ensureMongoose();
    const docs = await AgentModel.find({ project, "metadata.kind": "role" })
      .sort({ name: 1 })
      .lean();
    return docs.map(roleFromDoc);
  }

  async delete(project: string, name: string): Promise<boolean> {
    await ensureMongoose();
    const res = await AgentModel.deleteOne({ project, name, "metadata.kind": "role" });
    return res.deletedCount === 1;
  }
}
